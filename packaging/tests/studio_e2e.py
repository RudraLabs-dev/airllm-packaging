"""End-to-end test of AirLLM Studio against a real AirLLM model, fully offline.

    airllm-python studio_e2e.py [--airllm CMD] [--model HF_ID]

1. Builds a tiny random Llama model (2 layers, tied embeddings, chat template) in a temp dir,
   unless --model is given (then it pulls that Hugging Face model, which needs network).
2. Starts `airllm serve` on a free port with a throwaway AIRLLM_HOME.
3. Pulls (imports + AirLLM layer split), then exercises the Ollama API (/api/chat, /api/tags),
   the OpenAI API (/v1/chat/completions, streaming and not), the CLI (`airllm list`, `airllm run`)
   and the web UI (GET /).
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def make_tiny_model(path: Path) -> str:
    import torch
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    from transformers import LlamaConfig, LlamaForCausalLM, PreTrainedTokenizerFast

    text = ["AirLLM runs large language models on small GPUs by streaming layers from disk.",
            "The quick brown fox jumps over the lazy dog.", "Hello, how are you today?"] * 20
    tok = Tokenizer(models.BPE(unk_token="<unk>"))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    tok.train_from_iterator(text, trainers.BpeTrainer(vocab_size=300, special_tokens=["<unk>", "<s>", "</s>"]))
    hf_tok = PreTrainedTokenizerFast(tokenizer_object=tok, bos_token="<s>", eos_token="</s>",
                                     unk_token="<unk>", pad_token="</s>")
    hf_tok.chat_template = ("{% for m in messages %}<s>{{ m['role'] }}: {{ m['content'] }}</s>{% endfor %}"
                            "{% if add_generation_prompt %}<s>assistant: {% endif %}")
    hf_tok.save_pretrained(path)

    torch.manual_seed(0)
    config = LlamaConfig(vocab_size=len(hf_tok), hidden_size=64, intermediate_size=128,
                         num_hidden_layers=2, num_attention_heads=4, num_key_value_heads=2,
                         max_position_embeddings=256, tie_word_embeddings=True,
                         bos_token_id=hf_tok.bos_token_id, eos_token_id=hf_tok.eos_token_id)
    model = LlamaForCausalLM(config).to(torch.bfloat16)
    model.save_pretrained(path, safe_serialization=True)
    return str(path)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def call(url: str, path: str, body: dict | None = None, method: str | None = None, timeout=600):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def annotate(message: str) -> None:
    """Surface a failure as a GitHub Actions annotation (readable through the checks API)."""
    if os.environ.get("GITHUB_ACTIONS") or os.environ.get("AIRLLM_E2E_ANNOTATE"):
        text = message.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
        print(f"::error title=AirLLM Studio E2E::{text}", flush=True)


def check(cond: bool, what: str) -> None:
    print(("PASS  " if cond else "FAIL  ") + what, flush=True)
    if not cond:
        raise SystemExit(f"FAIL: {what}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--airllm", default="airllm", help="command that runs the airllm CLI")
    ap.add_argument("--model", help="Hugging Face model id to pull instead of the tiny local model")
    args = ap.parse_args()
    # A path to the launcher (may contain spaces), or a command line such as "python -m airllm_studio".
    cli = [args.airllm] if os.path.isfile(args.airllm) else shlex.split(args.airllm, posix=os.name != "nt")

    work = Path(tempfile.mkdtemp(prefix="airllm-e2e-"))
    port = free_port()
    env = {**os.environ, "AIRLLM_HOME": str(work / "home"), "AIRLLM_HOST": f"127.0.0.1:{port}"}
    os.environ.update({k: env[k] for k in ("AIRLLM_HOME", "AIRLLM_HOST")})
    url = f"http://127.0.0.1:{port}"
    model = args.model or make_tiny_model(work / "tiny-llama")
    log = open(work / "server.log", "wb")
    server = subprocess.Popen(cli + ["serve"], env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(240):
            try:
                call(url, "/api/version", timeout=2)
                break
            except OSError:
                if server.poll() is not None:
                    break
                time.sleep(0.5)
        check(server.poll() is None, "server started")
        print("      version:", json.loads(call(url, "/api/version").read()))

        # pull: Ollama-style NDJSON progress
        events = [json.loads(line) for line in call(url, "/api/pull", {"model": model}) if line.strip()]
        check(events[-1].get("status") == "success", f"pull {model} -> {events[-1]}")
        name = json.loads(call(url, "/api/tags").read())["models"][0]["name"]
        check(bool(name), f"model listed in /api/tags as {name}")

        # Ollama chat, streaming
        lines = [json.loads(line) for line in call(url, "/api/chat", {
            "model": name, "messages": [{"role": "user", "content": "Hello"}],
            "options": {"num_predict": 8, "temperature": 0}}) if line.strip()]
        final = lines[-1]
        text = "".join(item.get("message", {}).get("content", "") for item in lines)
        check(final.get("done") is True and final.get("eval_count", 0) > 0,
              f"/api/chat streamed {final.get('eval_count')} tokens: {text!r}")

        # OpenAI chat, non-streaming
        resp = json.loads(call(url, "/v1/chat/completions", {
            "model": name, "messages": [{"role": "user", "content": "Hi there"}],
            "max_tokens": 6, "temperature": 0}).read())
        check(resp["object"] == "chat.completion" and resp["usage"]["completion_tokens"] > 0,
              f"/v1/chat/completions usage={resp['usage']}")

        # OpenAI chat, streaming SSE
        chunks = [line.decode().strip() for line in call(url, "/v1/chat/completions", {
            "model": name, "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 4,
            "stream": True}) if line.strip()]
        check(chunks[-1] == "data: [DONE]" and len(chunks) >= 3, f"/v1 streaming sent {len(chunks)} events")

        # CLI against the running server
        out = subprocess.run(cli + ["list"], env=env, capture_output=True, text=True, timeout=120)
        check(out.returncode == 0 and name in out.stdout, "airllm list shows the model")
        out = subprocess.run(cli + ["run", name, "Say hi", "--max-tokens", "4"], env=env,
                             capture_output=True, text=True, timeout=600)
        check(out.returncode == 0, f"airllm run answered: {out.stdout.strip()!r}")

        html = call(url, "/").read().decode()
        check("<title>AirLLM" in html, "web UI served at /")
        status = json.loads(call(url, "/api/studio/status").read())
        print("      device:", status.get("device"), "| engine:", status["engine"]["state"])

        out = subprocess.run(cli + ["stop"], env=env, capture_output=True, text=True, timeout=60)
        server.wait(timeout=30)
        check(server.returncode is not None, "airllm stop shut the server down")
        print("STUDIO E2E PASSED")
        return 0
    except BaseException as exc:
        log.flush()
        tail = (work / "server.log").read_text(errors="replace")[-2500:]
        annotate(f"{type(exc).__name__}: {exc}\n--- server log tail ---\n{tail}")
        raise
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
        log.close()
        sys.stdout.write("\n--- server log (tail) ---\n")
        sys.stdout.write((work / "server.log").read_text(errors="replace")[-4000:])


if __name__ == "__main__":
    sys.exit(main())
