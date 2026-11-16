"""2단계 : 상용한자 2,136자 추리기, 급수·장·순번 부여 (SPEC 3.4).

- 상용한자 판별 : KANJIDIC2 grade 1~6, 8 (2010년 상용한자표). kanji-data의 상용한자 목록과 대조한다.
- 급수 : kanji-data의 jlpt_new. 값이 없으면 0(보충).
- 순번 : 급수 안에서 KANJIDIC2 신문 빈도(freq) 높은 순. 빈도가 없으면 그 뒤에 획수, 코드포인트 순.
- 장 : 순번을 CHAPTER_SIZE(20)자씩 묶는다.
- 획수·음독·훈독 : KANJIDIC2. 읽기 순서는 원본 그대로 둔다.

출력 : build/kanji_base.json, build/kanjidic_extra.json (한국 음 등 이후 단계용)

사용법 : python build_kanji.py [--level 5]   # --level을 주면 그 급수만 만든다 (N5 먼저 검증용)
"""

from __future__ import annotations

import argparse
import gzip
import sys
import xml.etree.ElementTree as ET

from common import BUILD, CHAPTER_SIZE, JOYO_COUNT, LEVELS, read_json, raw_file, write_json

JOYO_GRADES = {"1", "2", "3", "4", "5", "6", "8"}


def load_joyo_aliases() -> dict[str, str]:
    """상용한자표 자형 → JIS X 0208 대체 자형 (Unihan kJoyoKanji의 "U+" 값. 𠮟/叱, 剝/剥, 塡/填, 頰/頬).

    KANJIDIC2와 kanji-data는 이 4자를 서로 다른 자형으로 싣고 있어 연결에 쓴다.
    id는 상용한자표 자형으로 통일한다.
    """
    import zipfile

    out: dict[str, str] = {}
    with zipfile.ZipFile(raw_file("unihan")) as z:
        for line in z.read("Unihan_OtherMappings.txt").decode("utf-8").splitlines():
            if "\tkJoyoKanji\tU+" in line:
                cp, _, v = line.split("\t")
                out[chr(int(v[2:], 16))] = chr(int(cp[2:], 16))
    return out


def parse_kanjidic() -> dict[str, dict]:
    root = ET.parse(gzip.open(raw_file("kanjidic2"))).getroot()
    out: dict[str, dict] = {}
    for ch in root.iter("character"):
        misc = ch.find("misc")
        grade = misc.findtext("grade")
        if grade not in JOYO_GRADES:
            continue
        lit = ch.findtext("literal")
        readings = [(r.get("r_type"), r.text) for r in ch.iter("reading")]
        freq = misc.findtext("freq")
        out[lit] = {
            "grade": int(grade),
            "strokes": int(misc.findall("stroke_count")[0].text),
            "freq": int(freq) if freq else None,
            "on": [t for k, t in readings if k == "ja_on"],
            "kun": [t for k, t in readings if k == "ja_kun"],
            "korean_h": [t for k, t in readings if k == "korean_h"],
        }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", type=int, choices=LEVELS, help="이 급수만 만든다")
    args = ap.parse_args()

    kd = parse_kanjidic()
    jd = read_json(raw_file("kanji_data"))

    # 4자 자형 통일 : 어느 원본이 대체 자형으로 실었든 상용한자표 자형을 키로 쓴다.
    aliases = load_joyo_aliases()
    to_official = {alt: off for off, alt in aliases.items()}
    kd = {to_official.get(c, c): v for c, v in kd.items()}
    jd = {to_official.get(c, c): v for c, v in jd.items()}

    problems: list[str] = []
    if len(kd) != JOYO_COUNT:
        problems.append(f"KANJIDIC2 상용한자 수 {len(kd)} (기대 {JOYO_COUNT})")
    only_kd = sorted(set(kd) - set(jd))
    only_jd = sorted(set(jd) - set(kd))
    if only_kd or only_jd:
        problems.append(f"상용한자 목록 불일치 : KANJIDIC2에만 {only_kd}, kanji-data에만 {only_jd}")

    by_level: dict[int, list[str]] = {lv: [] for lv in LEVELS}
    for c in kd:
        lv = (jd.get(c) or {}).get("jlpt_new") or 0
        by_level[lv].append(c)

    def sort_key(c: str):
        f = kd[c]["freq"]
        return (f is None, f or 0, kd[c]["strokes"], ord(c))

    kanji: list[dict] = []
    extra: dict[str, dict] = {}
    for lv in LEVELS:
        if args.level is not None and lv != args.level:
            continue
        for i, c in enumerate(sorted(by_level[lv], key=sort_key), start=1):
            k = kd[c]
            kanji.append({
                "id": c,
                "level": lv,
                "chapter": (i - 1) // CHAPTER_SIZE + 1,
                "order": i,
                "strokes": k["strokes"],
                "on": k["on"],
                "kun": k["kun"],
            })
            extra[c] = {"korean_h": k["korean_h"], "freq": k["freq"], "grade": k["grade"]}

    write_json(BUILD / "kanji_base.json", kanji)
    write_json(BUILD / "kanjidic_extra.json", extra)
    write_json(BUILD / "build_kanji_meta.json", {
        "level_filter": args.level,
        "level_counts": {str(lv): len(by_level[lv]) for lv in LEVELS},
        "no_freq": sum(1 for c in kd if kd[c]["freq"] is None),
        "joyo_aliases": aliases,
        "problems": problems,
    })

    for p in problems:
        print(f"[문제] {p}")
    print(f"build_kanji : {len(kanji)}자 → build/kanji_base.json")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
