import threading

from airllm_studio.cli import build_parser, human_bytes, table
from airllm_studio.engine import GenOptions


def test_gen_options_clamp_and_merge():
    class D:
        max_new_tokens, temperature, top_p, context_length = 100, 0.7, 0.9, 4096

    o = GenOptions.merge(D, max_new_tokens=10**9, temperature=-1, top_p=5, stop="###")
    assert o.max_new_tokens == 32768 and o.temperature == 0 and o.top_p == 1.0 and o.stop == ["###"]
    assert GenOptions.merge(D).max_new_tokens == 100


def test_queue_and_cancel(studio):
    """A second request waits while the first one generates, and can be cancelled while waiting."""
    eng = studio.engine
    eng.delay = 0.02
    first_cancel, second_cancel = threading.Event(), threading.Event()
    first = eng.stream("org/ready-model", [{"role": "user", "content": "a"}], GenOptions(), first_cancel)
    next(first)                                      # holds the lock now
    events = []

    def second():
        for ev in eng.stream("org/ready-model", [{"role": "user", "content": "b"}], GenOptions(), second_cancel):
            events.append(ev)

    t = threading.Thread(target=second)
    t.start()
    t.join(0.3)
    assert events and events[0]["status"] == "queued"
    second_cancel.set()
    t.join(2)
    assert events[-1]["done_reason"] == "cancelled"
    first_cancel.set()
    assert list(first)[-1]["done_reason"] == "cancelled"
    assert eng.waiting == 0


def test_cli_parser_and_helpers():
    p = build_parser()
    args = p.parse_args(["run", "Qwen/Qwen3-8B", "hello", "world", "--max-tokens", "5"])
    assert args.model == "Qwen/Qwen3-8B" and args.prompt == ["hello", "world"] and args.max_tokens == 5
    assert p.parse_args(["ls"]).func.__name__ == "cmd_list"
    assert human_bytes(1536) == "2 KB" and human_bytes(5 * 1024**3) == "5.0 GB"
    assert table([["a", "1"]], ["NAME", "N"]).splitlines()[1].startswith("a")
