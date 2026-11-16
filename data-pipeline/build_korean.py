"""3단계 : 한국 훈음 연결과 신자체→정자체 후보 (SPEC 3.4).

한국 훈음 조회 순서 (SPEC 3.4의 3단계)
  (가) 한자 그대로 hanja.txt 조회 (뜻이 적힌 줄만 인정. hanja.txt의 신자체 줄은 대개 뜻이 비어 있다)
  (나) 없으면 정자체 후보로 조회 → 결과는 넣되 검수 목록에 올린다
  (다) 둘 다 없으면 KANJIDIC2의 한국 음만 넣고 검수 목록에 올린다

정자체 후보 (근거는 모두 Unihan)
  - 일본 공식 구자체 : kJinmeiyoKanji의 "연도:U+신자체" 대응 (일본 법무부 인명용 한자표의 이체자)
  - 보조 후보 : kSemanticVariant, kZVariant, kTraditionalVariant (양방향)
  - 한국 목록 : kKoreanEducationHanja(교육용 1,800자) 또는 kKoreanName(대법원 인명용)
  - hanja.txt : 후보 글자에 뜻이 적힌 줄이 있는지

  후보에서 빼는 것 (빼는 수는 보고서에 남긴다)
    - 근거가 하나도 없는 이체자 : 일본 공식 구자체도 아니고, 한국 목록+hanja.txt 뜻도 없음
      (중국 간체자, 부수 변형 등)
    - 신자체 자체가 한국 교육용 한자이고 hanja.txt에 뜻이 있을 때, 공식 구자체가 아닌 이체자
      (예 : 一의 갖은자 壹. 한국도 一을 쓰므로 정자체 후보가 아니다)

대표 훈음 순서 : 한문 교육용 기초한자 음(Unihan kHangul의 E) → KANJIDIC2 한국 음 순서 → hanja.txt 파일 순서

  한자별 구분
    일치     : 세 근거(일본 공식 구자체 + 한국 목록 + hanja.txt 뜻)를 모두 갖춘 후보가 정확히 1개
    엇갈림   : 후보는 있으나 위 조건을 만족하지 않음 (0개 또는 2개 이상)
    후보 없음 : 후보가 없음

  kanji.json의 ko_form은 여기서 정하지 않는다. overrides/ko_form.csv(사람이 승인한 값)만 apply_overrides.py가 반영한다.

출력 : build/korean.json, review/ko_form_review.csv, review/ko_hunum_review.csv
"""

from __future__ import annotations

import re
import sys
import zipfile
from collections import defaultdict

from common import BUILD, LEVELS, REVIEW, level_name, read_json, raw_file, write_csv, write_json

UNIHAN_FIELDS = {
    "kJinmeiyoKanji", "kJoyoKanji", "kKoreanEducationHanja", "kKoreanName",
    "kSemanticVariant", "kZVariant", "kTraditionalVariant", "kHangul",
}
VARIANT_FIELDS = ("kSemanticVariant", "kZVariant", "kTraditionalVariant")
CP_RE = re.compile(r"U\+([0-9A-F]{4,5})")


def is_compat(ch: str) -> bool:
    """CJK 호환 한자 (자형만 다른 같은 글자. 예 : 社 U+FA4C)."""
    cp = ord(ch)
    return 0xF900 <= cp <= 0xFAFF or 0x2F800 <= cp <= 0x2FA1F


# ---------- 원본 읽기 ----------

def load_hanja() -> tuple[dict[str, list[tuple[str, list[str]]]], set[str]]:
    """한자 1글자 → [(음, [뜻 목록])] (파일 순서, 뜻이 있는 줄만), 그리고 뜻 없이라도 등장한 한자 집합."""
    entries: dict[str, list[tuple[str, list[str]]]] = defaultdict(list)
    present: set[str] = set()
    with raw_file("hanja").open(encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split(":")
            if len(parts) != 3:
                continue
            eum, hanja, meaning = parts
            if len(hanja) != 1:
                continue  # 한자어는 쓰지 않는다
            present.add(hanja)
            meanings = [m.strip() for m in meaning.split(",") if m.strip()]
            if meanings:
                entries[hanja].append((eum, meanings))
    return entries, present


def load_unihan() -> dict[str, dict[str, str]]:
    data: dict[str, dict[str, str]] = defaultdict(dict)
    with zipfile.ZipFile(raw_file("unihan")) as z:
        for name in z.namelist():
            for line in z.read(name).decode("utf-8").splitlines():
                if not line or line.startswith("#"):
                    continue
                cp, field, value = line.split("\t", 2)
                if field in UNIHAN_FIELDS:
                    data[chr(int(cp[2:], 16))][field] = value
    return data


def cps(value: str) -> list[str]:
    return [chr(int(h, 16)) for h in CP_RE.findall(value)]


# ---------- 후보 계산 ----------

def build_candidate_index(unihan: dict[str, dict[str, str]]):
    official_old: dict[str, list[str]] = defaultdict(list)   # 신자체 → 공식 구자체들
    variant_src: dict[tuple[str, str], set[str]] = defaultdict(set)  # (신자체, 후보) → 근거 필드

    for ch, fields in unihan.items():
        v = fields.get("kJinmeiyoKanji", "")
        if ":" in v:
            for std in cps(v):
                official_old[std].append(ch)
                variant_src[(std, ch)].add("kJinmeiyoKanji")
        for f in VARIANT_FIELDS:
            for other in cps(fields.get(f, "")):
                if other == ch:
                    continue
                variant_src[(ch, other)].add(f)           # ch의 이체자로 other
                variant_src[(other, ch)].add(f + "(역)")   # other의 이체자로 ch
    by_kanji: dict[str, list[str]] = defaultdict(list)
    for (a, b) in variant_src:
        by_kanji[a].append(b)
    return official_old, variant_src, by_kanji


def korean_list(fields: dict[str, str]) -> str:
    tags = []
    if "kKoreanEducationHanja" in fields:
        tags.append("교육용")
    if "kKoreanName" in fields:
        tags.append("인명용")
    return "+".join(tags)


def split_hunum(eum: str, meaning: str) -> dict:
    if meaning.endswith(" " + eum):
        return {"hun": meaning[: -len(eum) - 1], "eum": eum}
    return {"hun": meaning, "eum": eum}


def edu_readings(fields: dict[str, str]) -> set[str]:
    """Unihan kHangul에서 한문 교육용 기초한자(E) 음."""
    out = set()
    for tok in fields.get("kHangul", "").split():
        eum, _, src = tok.partition(":")
        if "E" in src:
            out.add(eum)
    return out


def ranked_options(c: str, hanja, korean_h: list[str], unihan=None) -> list[dict]:
    """hanja.txt의 훈음을 교육용 음 → KANJIDIC2 한국 음 순서 → 파일 순서로 정렬해 펼친다."""
    entries = hanja.get(c, [])
    order = {e: i for i, e in enumerate(korean_h)}
    edu = edu_readings(unihan.get(c, {})) if unihan is not None else set()
    ranked = sorted(enumerate(entries), key=lambda t: (t[1][0] not in edu, order.get(t[1][0], len(order)), t[0]))
    out, seen = [], set()
    for _, (eum, meanings) in ranked:
        for m in meanings:
            h = split_hunum(eum, m)
            key = (h["hun"], h["eum"])
            if key not in seen:
                seen.add(key)
                out.append(h)
    return out


def fmt(opts: list[dict]) -> str:
    return " | ".join(f"{o['hun']} {o['eum']}".strip() for o in opts)


# ---------- 본체 ----------

def main() -> int:
    base = read_json(BUILD / "kanji_base.json")
    extra = read_json(BUILD / "kanjidic_extra.json")
    hanja, hanja_present = load_hanja()
    unihan = load_unihan()
    official_old, variant_src, by_kanji = build_candidate_index(unihan)

    korean: dict[str, dict] = {}
    form_rows: list[list] = []
    hunum_rows: list[list] = []
    groups = {"일치": 0, "엇갈림": 0, "후보 없음": 0}
    dropped = {"근거 없음": 0, "신자체가 한국 교육용": 0}
    paths = {"직접": 0, "정자체 후보 경유": 0, "없음": 0}

    for k in base:
        c = k["id"]
        lv = level_name(k["level"])
        korean_h = extra[c]["korean_h"]
        c_fields = unihan.get(c, {})
        c_kr = korean_list(c_fields)
        c_has_meaning = c in hanja

        # --- 정자체 후보 ---
        cands = []
        for cand in sorted(set(by_kanji.get(c, [])), key=lambda x: (x not in official_old.get(c, []), ord(x))):
            f = unihan.get(cand, {})
            info = {
                "char": cand,
                "official": cand in official_old.get(c, []),
                "kr": korean_list(f),
                "hanja": fmt(ranked_options(cand, hanja, korean_h, unihan)),
                "sources": ", ".join(sorted(variant_src[(c, cand)])),
            }
            info["full"] = info["official"] and bool(info["kr"]) and bool(info["hanja"])
            if not info["official"]:
                if not (info["kr"] and info["hanja"]):
                    dropped["근거 없음"] += 1
                    continue
                if "kKoreanEducationHanja" in c_fields and c_has_meaning:
                    dropped["신자체가 한국 교육용"] += 1
                    continue
            cands.append(info)

        full = [x for x in cands if x["full"]]
        if not cands:
            group = "후보 없음"
        elif len(full) == 1:
            group = "일치"
        else:
            group = "엇갈림"
        groups[group] += 1

        c_edu = "kKoreanEducationHanja" in c_fields
        for x in cands:
            notes = []
            if c_edu and c_has_meaning:
                notes.append("신자체도 한국 교육용 한자(한국도 신자체를 쓸 수 있음)")
            elif c_has_meaning:
                notes.append("신자체도 hanja.txt에 뜻이 있음(한국에서 별개 글자일 수 있음)")
            if is_compat(x["char"]):
                notes.append("후보가 호환 한자(자형만 다른 같은 글자)")
            caution = " ; ".join(notes)
            if group == "일치":
                row_group = "일치" if x["full"] else "참고(일치 후보 따로 있음)"
            else:
                row_group = group
            form_rows.append([
                c, x["char"], row_group,
                "Y" if x["official"] else "", x["kr"], "Y" if x["hanja"] else "", x["hanja"],
                x["sources"], c_kr, "Y" if c_has_meaning else "", lv, caution,
            ])
        if not cands and c in hanja_present and not c_has_meaning:
            # 후보는 없지만 hanja.txt에 신자체가 뜻 없이 올라 있다 → 한국 정자체가 따로 있을 가능성 (예 : 青/靑)
            form_rows.append([
                c, "", "후보 없음", "", "", "", "", "", c_kr, "", lv,
                "hanja.txt에 신자체가 뜻 없이만 있음. 정자체를 직접 확인 필요",
            ])

        # --- 한국 훈음 ---
        reasons: list[str] = []
        opts = ranked_options(c, hanja, korean_h, unihan)
        via = ""
        if opts:
            path = "직접"
            if any(x["official"] and x["hanja"] for x in cands):
                reasons.append("공식 구자체에도 훈음이 있음(신자체 훈음이 다른 글자의 것일 수 있음)")
        else:
            order = sorted(cands, key=lambda x: (not x["full"], not x["official"]))
            for x in order:
                o = ranked_options(x["char"], hanja, korean_h, unihan)
                if o:
                    opts, via = o, x["char"]
                    break
            path = "정자체 후보 경유" if opts else "없음"
            if opts:
                reasons.append(f"정자체 후보 {via}로 찾음")
        paths[path] += 1

        if opts:
            ko_main, ko_more = opts[0], opts[1:]
            if len(opts) > 1:
                reasons.append("대표 훈음 선택")
            if korean_h and ko_main["eum"] not in korean_h:
                reasons.append("KANJIDIC2 한국 음과 다름")
        else:
            ko_main = {"hun": "", "eum": korean_h[0]} if korean_h else None
            ko_more = [{"hun": "", "eum": e} for e in korean_h[1:]]
            reasons.append("훈음 없음(일본 고유 한자 후보) : KANJIDIC2 한국 음만 넣음")

        korean[c] = {"ko_main": ko_main, "ko_more": ko_more, "hunum_path": path, "hunum_via": via, "ko_form_group": group}

        if reasons:
            hunum_rows.append([
                c, lv, path, via,
                ko_main["hun"] if ko_main else "", ko_main["eum"] if ko_main else "",
                fmt(opts), "/".join(korean_h), " ; ".join(reasons),
            ])

    write_json(BUILD / "korean.json", korean)

    # 검수 순서 : 급수(N5 → N1 → 보충) → 장 → 순번. 앞 세 열을 급수·장·순번으로 둔다.
    pos = {k["id"]: (LEVELS.index(k["level"]), k["chapter"], k["order"]) for k in base}
    meta = {k["id"]: k for k in base}

    def by_level(rows: list[list], kanji_col: int, drop_col: int) -> list[list]:
        indexed = sorted(enumerate(rows), key=lambda t: (pos[t[1][kanji_col]], t[0]))
        out = []
        for _, r in indexed:
            k = meta[r[kanji_col]]
            rest = [v for i, v in enumerate(r) if i != drop_col]
            out.append([level_name(k["level"]), k["chapter"], k["order"], *rest])
        return out

    write_csv(
        REVIEW / "ko_form_review.csv",
        ["급수", "장", "순번", "신자체", "정자체 후보", "구분", "일본 공식 구자체", "한국 목록", "hanja.txt 뜻 있음",
         "hanja.txt 훈음", "후보 근거(Unihan)", "신자체 한국 목록", "신자체 hanja.txt 뜻 있음", "주의"],
        by_level(form_rows, 0, 10),
    )
    write_csv(
        REVIEW / "ko_hunum_review.csv",
        ["급수", "장", "순번", "한자", "조회 경로", "경유 정자체", "자동 훈", "자동 음", "hanja.txt 훈음 전체",
         "KANJIDIC2 한국 음", "검수 사유"],
        by_level(hunum_rows, 0, 1),
    )
    write_json(BUILD / "build_korean_meta.json", {
        "ko_form_groups": groups,
        "hunum_paths": paths,
        "ko_form_review_rows": len(form_rows),
        "ko_form_dropped": dropped,
        "ko_hunum_review_rows": len(hunum_rows),
        "ko_form_match_with_caution": sum(1 for r in form_rows if r[2] == "일치" and r[11]),
        "ko_form_match_shin_edu": sum(1 for r in form_rows if r[2] == "일치" and "교육용" in r[11]),
    })
    print(f"build_korean : 정자체 {groups}, 훈음 경로 {paths}")
    print(f"  review/ko_form_review.csv {len(form_rows)}행, review/ko_hunum_review.csv {len(hunum_rows)}행")
    return 0


if __name__ == "__main__":
    sys.exit(main())
