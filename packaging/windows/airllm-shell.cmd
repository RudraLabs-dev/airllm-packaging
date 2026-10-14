@echo off
rem Start-menu "AirLLM Command Prompt": puts AirLLM on PATH for this window and shows the setup.
set "PATH=%~dp0;%PATH%"
echo AirLLM command prompt. Commands: airllm-python, airllm-enable-cuda
airllm-python -c "import importlib.metadata as m, torch; print('airllm', m.version('airllm'), '| torch', torch.__version__, '| CUDA available:', torch.cuda.is_available())"
