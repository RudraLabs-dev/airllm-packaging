# AirLLM Studio

Local desktop app, command line and API server for [AirLLM](https://github.com/lyogavin/airllm),
in the spirit of Ollama. Shipped inside the RudraLabs AirLLM packages (.deb, .rpm, Windows installer).

```sh
airllm app                                   # desktop app (chat + model library); starts the server
airllm pull Qwen/Qwen3-8B                    # download from Hugging Face and prepare AirLLM's layers
airllm run Qwen/Qwen3-8B "Explain AirLLM"    # chat in the terminal
airllm list | ps | rm <model> | stop | status
airllm serve                                 # server only (127.0.0.1:11435, AIRLLM_HOST to change)
```

## API

| | |
|---|---|
| Ollama-compatible | `/api/chat`, `/api/generate`, `/api/tags`, `/api/pull`, `/api/delete`, `/api/ps`, `/api/show`, `/api/version` |
| OpenAI-compatible | `/v1/models`, `/v1/chat/completions` (streaming and not), `/v1/completions` |
| Studio (used by the UI) | `/api/studio/*`: status, settings, models, pull jobs, catalog, Hugging Face search, chats |
| Reference | `/docs` (interactive) |

Point any Ollama or OpenAI client at `http://127.0.0.1:11435` (OpenAI base URL: `http://127.0.0.1:11435/v1`).
To serve other machines set `AIRLLM_HOST=0.0.0.0:11435` and `AIRLLM_API_KEY=<secret>`; remote clients then send
`Authorization: Bearer <secret>`. Settings, model shutdown and folder actions only work from the local machine.

## How it runs models

One model is loaded at a time and requests are served in order (others see a *queued* status). AirLLM streams
every layer from disk for each token, so the UI shows a layer meter while it works. Pulling a model downloads the
safetensors weights (top-level files only, preferring safetensors over .bin) and runs AirLLM's one-time layer
split, so the first chat starts quickly. Data lives in `~/.airllm` (`AIRLLM_HOME`): `settings.json`, `chats.db`,
`logs/`, and `models/` (`AIRLLM_MODELS`, or the setting in the app).

## Development

```sh
pip install -e "studio[test]" && pytest studio/tests     # unit tests, no torch/GPU needed
python studio/tools/dev_server.py                        # UI against a fake slow engine
python studio/tools/make_icons.py                        # re-render PNG/ICO after editing icon.svg
airllm-python packaging/tests/studio_e2e.py              # real AirLLM end to end with a tiny model
```
