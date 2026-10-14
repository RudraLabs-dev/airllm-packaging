"""Small stdlib HTTP client used by the CLI and the desktop launcher."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterator

from .config import base_url, logs_dir


class ClientError(Exception):
    pass


class Client:
    def __init__(self, url: str | None = None):
        self.url = (url or base_url()).rstrip("/")
        self.api_key = os.environ.get("AIRLLM_API_KEY", "")

    def _request(self, method: str, path: str, body: dict | None = None, timeout: float | None = 30):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.api_key:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        try:
            return urllib.request.urlopen(req, timeout=timeout)  # noqa: S310 - local server URL
        except urllib.error.HTTPError as exc:
            try:
                payload = json.loads(exc.read().decode() or "{}")
                message = payload.get("error") or payload.get("detail") or exc.reason
                if isinstance(message, dict):
                    message = message.get("message", str(message))
            except ValueError:
                message = exc.reason
            raise ClientError(str(message)) from None
        except urllib.error.URLError as exc:
            raise ClientError(f"cannot reach AirLLM server at {self.url} ({exc.reason})") from None

    def get(self, path: str, timeout: float | None = 30) -> dict:
        with self._request("GET", path, timeout=timeout) as resp:
            return json.loads(resp.read().decode() or "{}")

    def post(self, path: str, body: dict | None = None, timeout: float | None = 30) -> dict:
        with self._request("POST", path, body or {}, timeout=timeout) as resp:
            return json.loads(resp.read().decode() or "{}")

    def delete(self, path: str, body: dict | None = None) -> dict:
        with self._request("DELETE", path, body or {}) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}

    def stream(self, path: str, body: dict) -> Iterator[dict]:
        """POST and iterate over an NDJSON response."""
        with self._request("POST", path, body, timeout=None) as resp:
            for line in resp:
                line = line.strip()
                if line:
                    item = json.loads(line)
                    if "error" in item:
                        raise ClientError(item["error"])
                    yield item

    # --- server lifecycle ----------------------------------------------------------------
    def running(self) -> bool:
        try:
            self.get("/api/version", timeout=1.5)
            return True
        except ClientError:
            return False

    def wait_ready(self, timeout: float = 60) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.running():
                return True
            time.sleep(0.3)
        return False


def spawn_server(extra_env: dict | None = None) -> subprocess.Popen:
    """Start `airllm serve` detached from this terminal, logging to <data>/logs/server.log."""
    log_path = Path(logs_dir()) / "server.log"
    log_file = open(log_path, "ab", buffering=0)  # noqa: SIM115 - handed to the child
    python = sys.executable
    kwargs: dict = {"stdout": log_file, "stderr": log_file, "stdin": subprocess.DEVNULL,
                    "env": {**os.environ, **(extra_env or {})}}
    if sys.platform == "win32":
        pythonw = Path(python).with_name("pythonw.exe")
        if pythonw.exists():
            python = str(pythonw)
        kwargs["creationflags"] = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                                   | subprocess.CREATE_NO_WINDOW)
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen([python, "-m", "airllm_studio", "serve"], **kwargs)


def ensure_server(client: Client | None = None, quiet: bool = False) -> Client:
    client = client or Client()
    if client.running():
        return client
    if not quiet:
        print(f"Starting AirLLM server at {client.url} ...", file=sys.stderr)
    spawn_server()
    if not client.wait_ready(90):
        raise ClientError(f"server did not start; see {Path(logs_dir()) / 'server.log'}")
    return client
