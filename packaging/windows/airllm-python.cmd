@echo off
rem Python interpreter bundled with AirLLM (Python + torch + transformers + airllm).
rem   airllm-python my_script.py
rem   airllm-python -m pip list
rem If airllm-enable-cuda was run, its CUDA PyTorch overlay takes precedence over the CPU build.
setlocal
set "AIRLLM_HOME=%~dp0"
if exist "%AIRLLM_HOME%cuda-site\" if not defined AIRLLM_FORCE_CPU (
    if defined PYTHONPATH (
        set "PYTHONPATH=%AIRLLM_HOME%cuda-site;%PYTHONPATH%"
    ) else (
        set "PYTHONPATH=%AIRLLM_HOME%cuda-site"
    )
)
"%AIRLLM_HOME%python\python.exe" %*
exit /b %ERRORLEVEL%
