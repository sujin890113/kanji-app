"""4단계 : 대표 단어 고르기 (SPEC 3.4, F9).

한자마다 단어 3개까지 고른다 (앱의 words_count 1~3 중 고른 수만 보여준다).
- 단어 속 한자가 모두 상용한자이고, 그 한자와 같거나 더 쉬운 급수다 (N5 → N4 → N3 → N2 → N1 → 보충 순으로 어렵다)
- JMdict 사용 빈도 표시(news1·ichi1·spec1·spec2·gai1)가 있는 단어를 먼저, 그 안에서 nf 순위·짧은 단어 순
- 불규칙·희귀 표기(iK·ik·oK·rK·sK·ateji), 첫 뜻이 고어·희귀·속어·보통 가나로 씀(uk)인 단어는 뺀다
- 훈독 그대로인 단어(貼る, 国)가 있으면 하나는 그것으로 둔다

뜻(한국어)은 여기서 정하지 않는다. apply_overrides.py가 검수 값(overrides/words_ko.csv)이나
번역 초안(drafts/words_ko_draft.csv)을 붙인다.

출력 : build/words.json  {"words": [{id, text, reading, gloss_en, level, kanji[], common, nf}], "by_kanji": {한자: [id...]}}
"""

from __future__ import annotations

import gzip
import io
import re
import sys
import xml.etree.ElementTree as ET

from common import BUILD, RAW, read_json, write_json

PER_KANJI = 3
COMMON_TAGS = {"news1", "ichi1", "spec1", "spec2", "gai1"}
BAD_KE_INF = {"iK", "ik", "oK", "rK", "sK", "ateji"}
BAD_MISC = {"arch", "obs", "rare", "vulg", "X", "derog", "sens", "uk", "obsc"}
# 급수 → 어려운 정도 (0 = 가장 쉬움)
RANK = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4, 0: 5}
XML_ENT = {"amp", "lt", "gt", "quot", "apos"}


def is_kanji(ch: str) -> bool:
    o = ord(ch)
    return 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0x20000 <= o <= 0x3FFFF or 0xF900 <= o <= 0xFAFF


def is_kana(ch: str) -> bool:
    return 0x3041 <= ord(ch) <= 0x30FF


def load_entries(path) -> list[dict]:
    """JMdict를 읽는다. 엔티티(&n; 등)는 펼치지 않고 이름 그대로 둔다"""
    text = gzip.open(path, "rt", encoding="utf-8").read()
    body = text[text.index("<JMdict>"):]
    body = re.sub(r"&([\w-]+);", lambda m: m.group(0) if m.group(1) in XML_ENT else m.group(1), body)
    out = []
    for _, el in ET.iterparse(io.BytesIO(body.encode("utf-8")), events=("end",)):
        if el.tag != "entry":
            continue
        kebs = [
            {"text": k.findtext("keb"), "inf": {x.text for x in k.findall("ke_inf")}, "pri": [x.text for x in k.findall("ke_pri")]}
            for k in el.findall("k_ele")
        ]
        rebs = [
            {
                "text": r.findtext("reb"),
                "nokanji": r.find("re_nokanji") is not None,
                "restr": {x.text for x in r.findall("re_restr")},
                "pri": [x.text for x in r.findall("re_pri")],
            }
            for r in el.findall("r_ele")
        ]
        senses = el.findall("sense")
        first = senses[0] if senses else None
        misc = {x.text for x in first.findall("misc")} if first is not None else set()
        glosses = []
        for s in senses[:3]:
            gl = [g.text for g in s.findall("gloss") if g.text]
            if gl:
                glosses.append(", ".join(gl[:3]))
        out.append({"seq": el.findtext("ent_seq"), "kebs": kebs, "rebs": rebs, "misc": misc, "gloss": "; ".join(glosses)})
        el.clear()
    return out


def reading_for(keb: str, rebs: list[dict]) -> str | None:
    for r in rebs:
        if r["nokanji"]:
            continue
        if not r["restr"] or keb in r["restr"]:
            return r["text"]
    return None


def nf_rank(pri: list[str]) -> int:
    nf = [int(p[2:]) for p in pri if p.startswith("nf")]
    return min(nf) if nf else 99


def main() -> int:
    base = read_json(BUILD / "kanji_base.json")
    level = {k["id"]: k["level"] for k in base}
    # 훈독 그대로인 단어 (貼る = は.る, 国 = くに) : (표기, 읽기)
    kun_word = {
        k["id"]: {(k["id"] + r.partition(".")[2], r.replace(".", "")) for r in k["kun"] if not r.startswith("-") and not r.endswith("-")}
        for k in base
    }
    order = {k["id"]: i for i, k in enumerate(base)}
    path = RAW / "jmdict" / "JMdict_e.gz"
    if not path.exists():
        print("JMdict가 없습니다. 먼저 python fetch.py --only jmdict", file=sys.stderr)
        return 1

    entries = load_entries(path)
    cands: dict[str, list[dict]] = {}
    for e in entries:
        if e["misc"] & BAD_MISC or not e["gloss"]:
            continue
        for i, k in enumerate(e["kebs"]):
            t = k["text"]
            if not t or k["inf"] & BAD_KE_INF or len(t) > 5:
                continue
            kan = [c for c in t if is_kanji(c)]
            if not kan or any(c not in level for c in kan) or any(not (is_kanji(c) or is_kana(c) or c == "々") for c in t):
                continue
            reading = reading_for(t, e["rebs"])
            if not reading:
                continue
            hardest = max(RANK[level[c]] for c in kan)
            w = {
                "id": f"{e['seq']}-{i}",
                "text": t,
                "reading": reading,
                "gloss_en": e["gloss"],
                "level": next(lv for lv, r in RANK.items() if r == hardest),
                "kanji": list(dict.fromkeys(kan)),
                "common": bool(set(k["pri"]) & COMMON_TAGS),
                "nf": nf_rank(k["pri"]),
                "_hardest": hardest,
                "_kun_forms": {(t, reading)},
            }
            for c in w["kanji"]:
                if RANK[level[c]] >= hardest:  # 이 한자보다 어려운 한자가 들어 있지 않다
                    cands.setdefault(c, []).append(w)

    chosen: dict[str, dict] = {}
    by_kanji: dict[str, list[str]] = {}
    stats = {"3": 0, "2": 0, "1": 0, "0": 0, "uncommon_used": 0}
    for k in base:
        c = k["id"]
        pool = cands.get(c, [])
        # 같은 표기는 하나만 (빈도 높은 쪽)
        pool = sorted(pool, key=lambda w: (not w["common"], w["nf"], len(w["text"]), w["id"]))
        seen, uniq = set(), []
        for w in pool:
            if w["text"] not in seen:
                seen.add(w["text"])
                uniq.append(w)
        picks: list[dict] = []
        single = next((w for w in uniq if w["common"] and w["_kun_forms"] & kun_word[c]), None)
        if single:
            picks.append(single)
        for w in uniq:
            if len(picks) >= PER_KANJI:
                break
            if w in picks or len(w["text"]) == 1 or not w["common"]:
                continue
            picks.append(w)
        # 모자라면 : 빈도 표시 있는 한 글자 단어(峠) → 빈도 표시 없는 단어
        for ok in (lambda w: w["common"], lambda w: True):
            for w in uniq:
                if len(picks) >= PER_KANJI:
                    break
                if w not in picks and ok(w):
                    picks.append(w)
        stats[str(len(picks))] += 1
        stats["uncommon_used"] += sum(1 for w in picks if not w["common"])
        by_kanji[c] = [w["id"] for w in picks]
        for w in picks:
            chosen[w["id"]] = w

    words = sorted(chosen.values(), key=lambda w: (w["_hardest"], min(order[c] for c in w["kanji"]), w["id"]))
    for w in words:
        del w["_hardest"], w["_kun_forms"]
    write_json(BUILD / "words.json", {"words": words, "by_kanji": by_kanji, "stats": stats})
    print(
        f"build_words : JMdict {len(entries)}항목 → 단어 {len(words)}개 "
        f"(한자별 3개 {stats['3']}, 2개 {stats['2']}, 1개 {stats['1']}, 0개 {stats['0']}; 빈도 표시 없는 단어 사용 {stats['uncommon_used']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
