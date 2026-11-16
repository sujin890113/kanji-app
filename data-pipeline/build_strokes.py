"""6단계 : 획순 데이터 (SPEC 3.2, 3.4, F10).

KanjiVG SVG에서 획 경로(path d)를 획 순서대로, 획 번호 위치를 함께 뽑는다.
한자 상세를 열 때만 읽도록 한자마다 파일 하나로 나눈다.

출력 : public/data/strokes/<코드포인트 5자리 16진수>.json  {"size": 109, "strokes": [d...], "numbers": [[x, y]...]}
"""

from __future__ import annotations

import json
import re
import sys
import zipfile

from common import BUILD, OUT, RAW, read_json

PATH = re.compile(r'<path\s+id="kvg:[0-9a-f]+-s(\d+)"[^>]*?\sd="([^"]+)"')
NUMBER = re.compile(r'<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)</text>')


def parse(svg: str) -> dict:
    strokes = sorted(((int(n), d) for n, d in PATH.findall(svg)), key=lambda t: t[0])
    numbers = sorted(((int(n), float(x), float(y)) for x, y, n in NUMBER.findall(svg)), key=lambda t: t[0])
    return {
        "size": 109,
        "strokes": [d for _, d in strokes],
        "numbers": [[x, y] for _, x, y in numbers],
        "_order_ok": [n for n, _ in strokes] == list(range(1, len(strokes) + 1)),
    }


def main() -> int:
    base = read_json(BUILD / "kanji_base.json")
    zpath = RAW / "kanjivg" / "kanjivg-20260714-main.zip"
    if not zpath.exists():
        print("KanjiVG가 없습니다. 먼저 python fetch.py --only kanjivg", file=sys.stderr)
        return 1
    z = zipfile.ZipFile(zpath)
    names = set(z.namelist())
    out_dir = OUT / "strokes"
    out_dir.mkdir(parents=True, exist_ok=True)
    problems, total_bytes, mismatch = [], 0, []
    for k in base:
        c = k["id"]
        code = f"{ord(c):05x}"
        name = f"kanji/{code}.svg"
        if name not in names:
            problems.append(f"{c} : KanjiVG 파일 없음")
            continue
        data = parse(z.read(name).decode("utf-8"))
        if not data.pop("_order_ok"):
            problems.append(f"{c} : 획 번호가 1부터 연속되지 않음")
        if len(data["numbers"]) != len(data["strokes"]):
            problems.append(f"{c} : 획 {len(data['strokes'])}개, 번호 {len(data['numbers'])}개")
        if len(data["strokes"]) != k["strokes"]:
            mismatch.append(f"{c} : KanjiVG {len(data['strokes'])}획, KANJIDIC2 {k['strokes']}획")
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        (out_dir / f"{code}.json").write_text(text, encoding="utf-8")
        total_bytes += len(text.encode("utf-8"))
    (BUILD / "build_strokes_meta.json").write_text(
        json.dumps({"problems": problems, "stroke_count_mismatch": mismatch}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    for p in problems:
        print(f"[문제] {p}")
    print(f"build_strokes : {len(base) - len(problems)}자 → public/data/strokes/ ({total_bytes / 1e6:.1f} MB), 획수 차이(KANJIDIC2와) {len(mismatch)}자")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
