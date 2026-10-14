@echo off
rem Switch AirLLM's bundled CPU PyTorch to a CUDA build. Run from an elevated prompt
rem if AirLLM is installed under Program Files.
rem   airllm-enable-cuda [cu126^|cu128^|cu130^|...]   airllm-enable-cuda status   airllm-enable-cuda disable
setlocal
set "ARG=%~1"
if not defined ARG (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0airllm-enable-cuda.ps1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0airllm-enable-cuda.ps1" "-Variant:%ARG%"
)
exit /b %ERRORLEVEL%
