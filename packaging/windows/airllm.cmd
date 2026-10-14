@echo off
rem AirLLM Studio command line: airllm serve ^| app ^| pull ^| run ^| list ^| ps ^| rm ^| stop ^| status
setlocal
set "AIRLLM_DIR=%~dp0"
if exist "%AIRLLM_DIR%cuda-site\" if not defined AIRLLM_FORCE_CPU (
    if defined PYTHONPATH (
        set "PYTHONPATH=%AIRLLM_DIR%cuda-site;%PYTHONPATH%"
    ) else (
        set "PYTHONPATH=%AIRLLM_DIR%cuda-site"
    )
)
"%AIRLLM_DIR%python\python.exe" -m airllm_studio %*
exit /b %ERRORLEVEL%
