"""5단계 : 음 대응 규칙, 음부 묶음, 유사 한자 (SPEC 3.4, F3·F4·F8).

- 음부 묶음·유사 한자 : KanjiVG의 구성 요소 정보(kvg:element, kvg:position, kvg:phon)로 계산한다.
- 음 대응 규칙 : 규칙 정의만 여기서 정하고, 한자별 판정은 apply_overrides.py가 검수된 최종 한국 음으로 한다
  (match_rules). 규칙 정의는 overrides/sound_rules.csv가 있으면 그것을, 없으면 SPEC 2.3의 초안을 쓴다.

출력 : build/relations.json  {"phonetic": {id: 묶음 id}, "groups": [...], "similar": {id: [..]}}
       build/sound_rule_defs.json
"""

from __future__ import annotations

import re
import sys
import zipfile
from collections import Counter, defaultdict

from common import BUILD, OVERRIDES, RAW, read_csv, read_json, write_json

# ---------------------------------------------------------------- 음 대응 규칙

# SPEC 2.3 F3 초기 규칙 목록(검수 대상). 패턴 문법 :
#   ko_pattern  "받침:ㄱ" "받침:ㄴ|ㅁ" "초성:ㅎ"
#   ja_pattern  "끝:ク|キ" (음독의 마지막 글자)  "행:カ|ガ" (음독 첫 글자의 행. 탁음·반탁음 행을 함께 적는다)
DRAFT_RULES = [
    ("batchim_g", "ㄱ받침 → ク·キ", "받침:ㄱ", "끝:ク|キ", "한국 음이 ㄱ받침이면 음독이 ク·キ로 끝나는 경우가 많다."),
    ("batchim_l", "ㄹ받침 → ツ·チ", "받침:ㄹ", "끝:ツ|チ", "한국 음이 ㄹ받침이면 음독이 ツ·チ로 끝나는 경우가 많다."),
    ("batchim_b", "ㅂ받침 → 장음(ウ)", "받침:ㅂ", "끝:ウ", "한국 음이 ㅂ받침이면 음독이 ウ로 끝나는 장음이 되는 경우가 많다."),
    ("batchim_ng", "ㅇ받침 → 장음(ウ·イ)", "받침:ㅇ", "끝:ウ|イ", "한국 음이 ㅇ받침이면 음독이 ウ·イ로 끝나는 장음이 되는 경우가 많다."),
    ("batchim_nm", "ㄴ·ㅁ받침 → ン", "받침:ㄴ|ㅁ", "끝:ン", "한국 음이 ㄴ·ㅁ받침이면 음독이 ン으로 끝나는 경우가 많다."),
    ("initial_h", "초성 ㅎ → カ행", "초성:ㅎ", "행:カ|ガ", "한국 음의 초성이 ㅎ이면 음독이 カ행(ガ행 포함)으로 시작하는 경우가 많다."),
    ("initial_bp", "초성 ㅂ·ㅍ → ハ행", "초성:ㅂ|ㅍ", "행:ハ|バ|パ", "한국 음의 초성이 ㅂ·ㅍ이면 음독이 ハ행(バ·パ행 포함)으로 시작하는 경우가 많다."),
]

INITIALS = list("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
FINALS = [""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ")
ROWS = {
    "カ": "カキクケコ", "ガ": "ガギグゲゴ", "サ": "サシスセソ", "ザ": "ザジズゼゾ",
    "タ": "タチツテト", "ダ": "ダヂヅデド", "ナ": "ナニヌネノ", "ハ": "ハヒフヘホ",
    "バ": "バビブベボ", "パ": "パピプペポ", "マ": "マミムメモ", "ヤ": "ヤユヨ",
    "ラ": "ラリルレロ", "ワ": "ワヲ",
}


def jamo(syllable: str) -> tuple[str, str] | None:
    """한글 음절 → (초성, 받침). 한글 음절이 아니면 None"""
    if len(syllable) != 1 or not "가" <= syllable <= "힣":
        return None
    i = ord(syllable) - 0xAC00
    return INITIALS[i // 588], FINALS[i % 28]


def ko_matches(pattern: str, eum: str) -> bool:
    kind, _, values = pattern.partition(":")
    j = jamo(eum)
    if not j:
        return False
    return (j[1] if kind == "받침" else j[0]) in values.split("|")


def ja_matches(pattern: str, on: str) -> bool:
    kind, _, values = pattern.partition(":")
    if not on:
        return False
    if kind == "끝":
        return on[-1] in values.split("|")
    return any(on[0] in ROWS.get(r, "") for r in values.split("|"))


def load_rule_defs() -> tuple[list[dict], str]:
    """overrides/sound_rules.csv(검수 결과)가 있으면 그것을, 없으면 초안"""
    path = OVERRIDES / "sound_rules.csv"
    if path.exists():
        rows = read_csv(path)
        return [
            {"id": r["id"], "title": r["title"], "ko_pattern": r["ko_pattern"], "ja_pattern": r["ja_pattern"], "description": r.get("description", "")}
            for r in rows
            if r.get("id")
        ], "overrides/sound_rules.csv"
    return [
        {"id": i, "title": t, "ko_pattern": k, "ja_pattern": j, "description": d} for i, t, k, j, d in DRAFT_RULES
    ], "SPEC 2.3 초안"


def match_rules(eum: str | None, on: list[str], defs: list[dict]) -> list[str]:
    """한국 음과 음독 양쪽이 규칙에 맞는 규칙 id. 한국 음이 없으면(국자 등) 빈 목록"""
    if not eum:
        return []
    return [d["id"] for d in defs if ko_matches(d["ko_pattern"], eum) and any(ja_matches(d["ja_pattern"], o) for o in on)]


# ---------------------------------------------------------------- KanjiVG

G_TAG = re.compile(r"<g\b([^>]*)>|</g>")
ATTR = re.compile(r'([\w:]+)="([^"]*)"')


def parse_kanjivg(svg: str) -> list[dict]:
    """획 경로 묶음 안의 구성 요소 목록 : [{element, position, phon, depth}] (depth 0 = 한자 자신)"""
    start = svg.find('id="kvg:StrokePaths_')
    end = svg.find('id="kvg:StrokeNumbers_')
    body = svg[start:end if end > 0 else None]
    out, depth = [], -1
    for m in G_TAG.finditer(body):
        if m.group(0) == "</g>":
            depth -= 1
            continue
        depth += 1
        attrs = dict(ATTR.findall(m.group(1) or ""))
        if "kvg:element" in attrs:
            out.append({
                "element": attrs["kvg:element"],
                "position": attrs.get("kvg:position", ""),
                "phon": attrs.get("kvg:phon"),
                "depth": depth,
            })
    if out:
        base = out[0]["depth"]
        for e in out:
            e["depth"] -= base
    return out


def main() -> int:
    base = read_json(BUILD / "kanji_base.json")
    ids = [k["id"] for k in base]
    by_id = {k["id"]: k for k in base}
    zpath = RAW / "kanjivg" / "kanjivg-20260714-main.zip"
    if not zpath.exists():
        print("KanjiVG가 없습니다. 먼저 python fetch.py --only kanjivg", file=sys.stderr)
        return 1

    z = zipfile.ZipFile(zpath)
    names = set(z.namelist())
    parts: dict[str, list[dict]] = {}
    missing = []
    for c in ids:
        n = f"kanji/{ord(c):05x}.svg"
        if n not in names:
            missing.append(c)
            continue
        parts[c] = parse_kanjivg(z.read(n).decode("utf-8"))

    # ---- 음부 묶음 : 가장 바깥쪽 음부 표시(kvg:phon)의 구성 요소로 묶고, 음독을 공유하는 한자만
    comp_of: dict[str, str] = {}
    for c, ps in parts.items():
        phon = next((p for p in ps if p["depth"] > 0 and p["phon"]), None)
        if phon:
            comp_of[c] = phon["element"]
    by_comp: dict[str, list[str]] = defaultdict(list)
    for c, comp in comp_of.items():
        by_comp[comp].append(c)
    for comp in list(by_comp):
        if comp in by_id and comp not in by_comp[comp]:
            by_comp[comp].append(comp)  # 음부 자체가 상용한자면 함께 (青 → 清·晴)
    order = {c: i for i, c in enumerate(ids)}
    groups, phonetic = [], {}
    for comp, members in sorted(by_comp.items(), key=lambda kv: min(order[m] for m in kv[1])):
        readings = Counter(o for m in members for o in set(by_id[m]["on"]))
        if not readings:
            continue
        reading, n = readings.most_common(1)[0]
        mem = sorted((m for m in members if reading in by_id[m]["on"]), key=order.get)
        if n < 2 or len(mem) < 2:
            continue
        gid = f"phon_{comp}"
        groups.append({"id": gid, "component": comp, "reading": reading, "members": mem})
        for m in mem:
            phonetic.setdefault(m, gid)

    # ---- 유사 한자 : 구성 요소가 많이 겹치고 획수 차이가 작은 순으로 최대 3자
    elems = {c: {p["element"] for p in ps if p["depth"] > 0} for c, ps in parts.items()}
    tops = {c: {(p["element"], p["position"]) for p in ps if p["depth"] == 1} for c, ps in parts.items()}
    similar: dict[str, list[str]] = {}
    cand = [c for c in ids if elems.get(c)]
    for a in cand:
        scored = []
        for b in cand:
            if a == b:
                continue
            ds = abs(by_id[a]["strokes"] - by_id[b]["strokes"])
            if ds > 4:
                continue
            ea, eb = elems[a], elems[b]
            inter = len(ea & eb)
            if not inter:
                continue
            jac = inter / len(ea | eb)
            shared_top = len(tops[a] & tops[b]) / max(len(tops[a]), len(tops[b]), 1)
            if jac < 0.35 or shared_top == 0:
                continue
            score = jac + 0.3 * shared_top - 0.04 * ds
            if score >= 0.5:
                scored.append((score, order[b], b))
        scored.sort(key=lambda t: (-t[0], t[1]))
        if scored:
            similar[a] = [b for _, _, b in scored[:3]]

    defs, src = load_rule_defs()
    write_json(BUILD / "sound_rule_defs.json", {"source": src, "rules": defs})
    write_json(BUILD / "relations.json", {
        "kanjivg_missing": missing,
        "phonetic": phonetic,
        "groups": groups,
        "similar": similar,
    })
    print(
        f"build_relations : KanjiVG {len(parts)}자(없음 {len(missing)}), 음부 묶음 {len(groups)}개 · {len(phonetic)}자, "
        f"유사 한자 {len(similar)}자, 음 대응 규칙 {len(defs)}개({src})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
