"""Desktop integration: open the UI in an app-style window and, on Windows, a tray icon."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

from .client import Client, ClientError, ensure_server
from .config import data_dir, logs_dir, parse_host

log = logging.getLogger("airllm_studio.desktop")
WEB_DIR = Path(__file__).parent / "web"

CHROMIUM_LINUX = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                  "microsoft-edge", "microsoft-edge-stable", "brave-browser"]


def _find_windows_edge() -> str | None:
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                 os.environ.get("LOCALAPPDATA")):
        if base:
            path = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if path.exists():
                return str(path)
    return shutil.which("msedge")


def open_window(url: str) -> None:
    """Open the UI as a standalone app window (Edge/Chrome --app), else in the default browser."""
    browser = None
    if sys.platform == "win32":
        browser = _find_windows_edge()
    elif sys.platform.startswith("linux"):
        browser = next((shutil.which(b) for b in CHROMIUM_LINUX if shutil.which(b)), None)
    if browser:
        profile = data_dir() / "window-profile"
        args = [browser, f"--app={url}", f"--user-data-dir={profile}", "--no-first-run",
                "--no-default-browser-check", "--window-size=1280,860"]
        try:
            kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
            if sys.platform != "win32":
                kwargs["start_new_session"] = True
            subprocess.Popen(args, **kwargs)
            return
        except OSError as exc:
            log.warning("could not start %s: %s", browser, exc)
    webbrowser.open(url)


def _redirect_output_if_windowless() -> None:
    """pythonw has no stdout/stderr; libraries that print would crash, so send them to a log."""
    if sys.stdout is None or sys.stderr is None:
        stream = open(logs_dir() / "app.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream


def run_app(background: bool = False) -> int:
    client = Client()
    url = client.url + "/"
    if client.running():
        if not background:
            open_window(url)
        return 0
    if sys.platform == "win32":
        try:
            import pystray  # noqa: F401
        except ImportError:
            pass
        else:
            return _run_with_tray(open_on_start=not background)
    try:
        ensure_server(client, quiet=True)
    except ClientError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if not background:
        open_window(url)
    return 0


def _run_with_tray(open_on_start: bool) -> int:
    """Windows: host the server in this (windowless) process with a tray icon to open or quit."""
    import pystray
    import uvicorn
    from PIL import Image

    from .server import Studio, create_app

    _redirect_output_if_windowless()
    logging.basicConfig(filename=str(logs_dir() / "server.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    host, port = parse_host()
    studio = Studio()
    server = uvicorn.Server(uvicorn.Config(create_app(studio), host=host, port=port, log_config=None,
                                           access_log=False, timeout_graceful_shutdown=5))
    client = Client()
    url = client.url + "/"

    def quit_app(icon=None, item=None):
        server.should_exit = True
        if icon is not None:
            icon.stop()

    studio.shutdown_hook = lambda: quit_app(tray)

    def open_folder(path: Path):
        os.startfile(str(path))  # type: ignore[attr-defined]

    tray = pystray.Icon(
        "AirLLM", Image.open(WEB_DIR / "icon-256.png"), "AirLLM",
        menu=pystray.Menu(
            pystray.MenuItem("Open AirLLM", lambda i, it: open_window(url), default=True),
            pystray.MenuItem("Open models folder", lambda i, it: open_folder(studio.settings.models_dir())),
            pystray.MenuItem("Open logs folder", lambda i, it: open_folder(logs_dir())),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit AirLLM", quit_app),
        ))

    def serve():
        try:
            server.run()
        finally:
            tray.stop()

    thread = threading.Thread(target=serve, name="uvicorn", daemon=True)
    thread.start()
    if open_on_start:
        def open_when_ready():
            if client.wait_ready(60):
                open_window(url)
        threading.Thread(target=open_when_ready, daemon=True).start()
    tray.run()                      # blocks until Quit
    server.should_exit = True
    thread.join(timeout=10)
    return 0
