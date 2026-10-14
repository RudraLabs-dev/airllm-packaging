"""The app window must identify itself as AirLLM, or Linux docks show a generic icon."""
import configparser
from pathlib import Path

from airllm_studio.desktop import WM_CLASS, chromium_app_id, window_command

DESKTOP_FILE = Path(__file__).resolve().parents[2] / "packaging" / "linux" / "airllm.desktop"
URL = "http://127.0.0.1:11435/"


def desktop_entry() -> dict:
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str
    parser.read(DESKTOP_FILE)
    return dict(parser["Desktop Entry"])


def test_chromium_app_id_matches_chromium_naming():
    # chrome/browser/web_applications/os_integration/web_app_shortcut_linux.cc: GetShortcutFileName
    assert chromium_app_id(URL) == "chrome-127.0.0.1__-Default"
    assert chromium_app_id("http://127.0.0.1:9000/") == "chrome-127.0.0.1__-Default"   # port is not part of it
    assert chromium_app_id(URL, exe="msedge") == "msedge-127.0.0.1__-Default"


def test_desktop_file_matches_the_window_on_x11_and_wayland():
    entry = desktop_entry()
    assert DESKTOP_FILE.stem == WM_CLASS                       # X11: WM_CLASS "airllm" -> airllm.desktop
    assert entry["StartupWMClass"] == chromium_app_id(URL)    # Wayland: Chromium's app_id
    assert entry["Icon"] == "airllm"


def test_linux_window_command_x11():
    args = window_command("/usr/bin/google-chrome", URL, "linux", {"XDG_SESSION_TYPE": "x11"})
    assert f"--app={URL}" in args and f"--class={WM_CLASS}" in args
    assert not any(a.startswith("--ozone-platform") for a in args)


def test_linux_window_command_wayland():
    chrome = window_command("/usr/bin/google-chrome", URL, "linux", {"WAYLAND_DISPLAY": "wayland-0"})
    assert not any(a.startswith("--ozone-platform") for a in chrome)        # native Wayland, app_id matches
    edge = window_command("/usr/bin/microsoft-edge", URL, "linux", {"WAYLAND_DISPLAY": "wayland-0"})
    assert "--ozone-platform=x11" in edge                                    # "msedge-..." would not match


def test_localhost_is_normalised_so_the_app_id_is_stable():
    args = window_command("/usr/bin/chromium", "http://localhost:11435", "linux", {})
    assert "--app=http://127.0.0.1:11435/" in args


def test_snap_browsers_get_a_profile_they_can_write():
    args = window_command("/snap/bin/chromium", URL, "linux", {})
    profile = next(a for a in args if a.startswith("--user-data-dir="))
    assert "/snap/chromium/common/" in profile and "/.airllm" not in profile


def test_windows_command_has_no_linux_flags():
    args = window_command(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", URL, "win32", {})
    assert f"--app={URL}" in args
    assert not any(a.startswith(("--class", "--ozone-platform")) for a in args)
