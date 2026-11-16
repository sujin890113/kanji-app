"""앱 아이콘(주홍 도장) PNG를 만든다. M7 설치형 웹앱용.

글꼴은 앱에 들어 있는 Klee One 600(@fontsource/klee-one, SIL OFL 1.1)에서
'漢'이 든 하위 집합 파일을 찾아 쓴다. 색은 src/styles/tokens.css의 --shu, --surface와 같다.

실행 : python scripts/make_icons.py   (Pillow, fontTools, brotli 필요)
결과 : public/icons/*.png
"""

from __future__ import annotations

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "node_modules" / "@fontsource" / "klee-one" / "files"
OUT = ROOT / "public" / "icons"

GLYPH = "漢"
SHU = (0xD9, 0x43, 0x2F, 255)  # --shu (라이트)
PAPER = (0xFF, 0xFD, 0xF8, 255)  # --surface (라이트)


def find_font() -> bytes:
    """GLYPH가 든 Klee One 600 하위 집합을 TTF 바이트로 돌려준다."""
    for path in sorted(FONT_DIR.glob("klee-one-*-600-normal.woff2")):
        font = TTFont(path)
        if ord(GLYPH) in font.getBestCmap():
            font.flavor = None  # woff2 → sfnt
            buf = io.BytesIO()
            font.save(buf)
            return buf.getvalue()
    raise SystemExit(f"{GLYPH}가 든 글꼴 파일을 찾지 못했습니다: {FONT_DIR}")


def draw_icon(size: int, font_bytes: bytes, *, full_bleed: bool, glyph_ratio: float) -> Image.Image:
    """도장 아이콘.
    full_bleed : 바탕을 끝까지 채운다 (maskable, apple-touch). 아니면 둥근 사각 도장.
    glyph_ratio : 글자 크기 / 아이콘 크기
    """
    scale = 4  # 크게 그린 뒤 줄여서 가장자리를 매끄럽게
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, s, s], fill=SHU)
        frame_inset = s * 0.2  # maskable 안전 영역(가운데 80%) 안쪽에 테두리
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=SHU)
        frame_inset = s * 0.09
    # 도장 안쪽 테두리
    d.rounded_rectangle(
        [frame_inset, frame_inset, s - frame_inset, s - frame_inset],
        radius=s * 0.12,
        outline=PAPER,
        width=max(2, round(s * 0.025)),
    )
    font = ImageFont.truetype(io.BytesIO(font_bytes), round(s * glyph_ratio))
    # 작은 크기에서도 획이 보이도록 살짝 굵게
    stroke = max(1, round(s * glyph_ratio * 0.012))
    d.text((s / 2, s / 2), GLYPH, font=font, fill=PAPER, anchor="mm", stroke_width=stroke, stroke_fill=PAPER)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fb = find_font()
    icons = {
        "icon-192.png": draw_icon(192, fb, full_bleed=False, glyph_ratio=0.56),
        "icon-512.png": draw_icon(512, fb, full_bleed=False, glyph_ratio=0.56),
        "icon-maskable-512.png": draw_icon(512, fb, full_bleed=True, glyph_ratio=0.4),
        "apple-touch-icon-180.png": draw_icon(180, fb, full_bleed=True, glyph_ratio=0.48),
        "favicon-64.png": draw_icon(64, fb, full_bleed=False, glyph_ratio=0.6),
    }
    for name, img in icons.items():
        img.save(OUT / name, optimize=True)
        print(name, img.size)


if __name__ == "__main__":
    main()
