#!/usr/bin/env python3
"""Resize and compress a van/airport photo for the static site.

Never upscales. Writes WebP and JPEG at the widths for that slot kind.
Originals stay out of the repo; only the files this script writes belong in git.

  python3 tools/encode-van-photo.py --kind hero --slot side --src photo.jpg
  python3 tools/encode-van-photo.py --kind interior --slot interior-1 --src photo.jpg
  python3 tools/encode-van-photo.py --kind airport --slot airport-sunset --src photo.jpg
  python3 tools/encode-van-photo.py --kind logo --slot logo-round --src logo.png

Hero slots:     assets/images/van/{slot}-{800,1200,1500}.{webp,jpg}  (max 1600 edge)
Interior slots: assets/images/van/{slot}-{640,1000}.{webp,jpg}
Airport slots:  assets/images/van/{slot}-{640,1200}.{webp,jpg}
Logo:           assets/images/logo-round.webp and logo-round.png (512 square)
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "images" / "van"

KINDS = {
    "hero": {"widths": (800, 1200, 1500), "max_edge": 1600, "webp_q": 72, "jpeg_q": 76},
    "interior": {"widths": (640, 1000), "max_edge": 1000, "webp_q": 72, "jpeg_q": 76},
    "airport": {"widths": (640, 1200), "max_edge": 1200, "webp_q": 72, "jpeg_q": 76},
    "logo": {"widths": (512,), "max_edge": 512, "webp_q": 82, "jpeg_q": 82},
}


def resize_to_width(im: Image.Image, width: int) -> Image.Image:
    im = im.copy()
    if width > im.size[0]:
        width = im.size[0]
    height = max(1, round(im.size[1] * (width / im.size[0])))
    im = im.resize((width, height), Image.Resampling.LANCZOS)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    return im


def save_pair(im: Image.Image, dest_stem: Path, webp_q: int, jpeg_q: int) -> None:
    dest_stem.parent.mkdir(parents=True, exist_ok=True)
    webp = im
    if webp.mode == "P":
        webp = webp.convert("RGBA")
    webp.save(dest_stem.with_suffix(".webp"), "WEBP", quality=webp_q, method=6)
    jpg = im.convert("RGB")
    jpg.save(
        dest_stem.with_suffix(".jpg"),
        "JPEG",
        quality=jpeg_q,
        optimize=True,
        progressive=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", required=True, choices=sorted(KINDS))
    parser.add_argument("--slot", required=True, help="file slug, e.g. side, front, interior-1")
    parser.add_argument("--src", required=True, type=Path)
    args = parser.parse_args()

    spec = KINDS[args.kind]
    im = Image.open(args.src)
    print(f"source {args.src} {im.size[0]}x{im.size[1]} {im.mode}")

    if args.kind == "logo":
        logo = im.convert("RGBA")
        logo.thumbnail((512, 512), Image.Resampling.LANCZOS)
        # Square canvas so the header can clip it to a circle without stretching.
        side = max(logo.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(logo, ((side - logo.size[0]) // 2, (side - logo.size[1]) // 2), logo)
        out = ROOT / "assets" / "images" / "logo-round"
        save_pair(canvas, out, spec["webp_q"], spec["jpeg_q"])
        # JPEG has no alpha; also keep a PNG for the circle mark.
        canvas.save(out.with_suffix(".png"), "PNG", optimize=True)
        # Drop the flat JPEG; a transparent mark needs PNG/WebP.
        out.with_suffix(".jpg").unlink(missing_ok=True)
        for path in (out.with_suffix(".webp"), out.with_suffix(".png")):
            print(f"{path.relative_to(ROOT)} {path.stat().st_size} {canvas.size[0]}x{canvas.size[1]}")
        return

    cap = min(im.size[0], spec["max_edge"])
    widths = sorted({w for w in spec["widths"] if w < cap} | {cap})

    for width in widths:
        sized = resize_to_width(im, width)
        stem = OUT_DIR / f"{args.slot}-{sized.size[0]}"
        save_pair(sized, stem, spec["webp_q"], spec["jpeg_q"])
        for ext in (".webp", ".jpg"):
            path = stem.with_suffix(ext)
            print(f"{path.relative_to(ROOT)} {path.stat().st_size} {sized.size[0]}x{sized.size[1]}")


if __name__ == "__main__":
    main()
