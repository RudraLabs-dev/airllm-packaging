"""Render the AirLLM icon (same geometry as web/icon.svg) to PNG and ICO with Pillow.

    python studio/tools/make_icons.py

Writes web/icon-256.png (tray, Linux desktop entry) and web/airllm.ico (Windows shortcuts/installer).
Run it after changing icon.svg and commit the outputs.
"""
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parents[1] / "src" / "airllm_studio" / "web"
BG, LAYER, ACTIVE = "#15212C", "#3E5163", "#35B5AA"
LAYERS = [(15, 13, 34, 5), (15, 21.5, 34, 5), (15, 38, 34, 5), (15, 46.5, 34, 5)]
CURRENT = (9, 29.5, 46, 5.5)


def render(size: int) -> Image.Image:
    scale = 8                                   # supersample, then downscale for clean edges
    s = size * scale / 64
    img = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 64 * s - 1, 64 * s - 1], radius=14 * s, fill=BG)
    for x, y, w, h in LAYERS:
        d.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s], radius=h * s / 2, fill=LAYER)
    x, y, w, h = CURRENT
    d.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s], radius=h * s / 2, fill=ACTIVE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    render(256).save(WEB / "icon-256.png")
    sizes = [(n, n) for n in (16, 24, 32, 48, 64, 128, 256)]
    render(256).save(WEB / "airllm.ico", sizes=sizes)
    print("wrote", WEB / "icon-256.png", WEB / "airllm.ico")


if __name__ == "__main__":
    main()
