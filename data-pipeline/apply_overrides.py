"""7단계 : 검수 결과 반영과 kanji.json 출력 (SPEC 3.4).

overrides/ 의 CSV는 사람이 검수한 결과다. 이 스크립트는 읽기만 하고 절대 쓰지 않는다.

overrides/ko_form.csv  (열 : 신자체, 정자체, 비고)
  - 정자체가 비어 있으면 "정자체가 신자체와 같다"로 확정 → ko_form = null
  - 이 파일에 없는 한자의 ko_form은 null (미검수)

overrides/ko_hunum.csv (열 : 한자, 훈, 음, 그밖의 훈음, 일본 고유 한자, 뜻 풀이, 비고)
  - 훈·음이 있으면 대표 훈음을 그 값으로 바꾼다
  - 그밖의 훈음 : "훈 음; 훈 음" 형식. 비어 있으면 자동값 유지
  - 일본 고유 한자 : Y면 kokuji = true, 대표 훈음은 비운다 (SPEC 2.3 F1)
  - 뜻 풀이 : meaning_ko (선택 항목. 비우면 null → 카드에 훈음만 표시)

출력 : public/data/kanji.json, public/data/meta.json
"""

from __future__ import annotations

import datetime as dt
import sys

from common import BUILD, LOCK, OUT, OVERRIDES, read_csv, read_json, write_json


def load_override(name: str, key: str) -> tuple[dict[str, dict], list[str]]:
    path = OVERRIDES / name
    if not path.exists():
        return {}, []
    rows, errors, out = read_csv(path), [], {}
    for i, r in enumerate(rows, start=2):
        k = (r.get(key) or "").strip()
        if not k:
            errors.append(f"{name} {i}행 : '{key}' 열이 비어 있음")
        elif k in out:
            errors.append(f"{name} {i}행 : {k} 중복")
        else:
            out[k] = {a: (b or "").strip() for a, b in r.items() if a}
    return out, errors


def parse_more(text: str) -> list[dict]:
    out = []
    for part in text.split(";"):
        part = part.strip()
        if not part:
            continue
        hun, _, eum = part.rpartition(" ")
        out.append({"hun": hun, "eum": eum})
    return out


def main() -> int:
    base = read_json(BUILD / "kanji_base.json")
    korean = read_json(BUILD / "korean.json")
    ids = {k["id"] for k in base}

    forms, e1 = load_override("ko_form.csv", "신자체")
    hunums, e2 = load_override("ko_hunum.csv", "한자")
    errors = e1 + e2
    for name, table in (("ko_form.csv", forms), ("ko_hunum.csv", hunums)):
        for k in table:
            if k not in ids:
                errors.append(f"{name} : {k}는 이번 빌드에 없는 한자")

    out = []
    applied = {"ko_form": 0, "ko_hunum": 0}
    for k in base:
        c = k["id"]
        ko = korean[c]
        item = {
            **k,
            "ko_main": ko["ko_main"],
            "ko_more": ko["ko_more"],
            "ko_form": None,
            "kokuji": False,
            "meaning_ko": None,
            "rules": [],       # M4 (build_relations.py)
            "phonetic": None,  # M4
            "similar": [],     # M4
            "words": [],       # M5 (build_words.py)
        }
        if c in forms:
            v = forms[c].get("정자체", "")
            item["ko_form"] = v if v and v != c else None
            applied["ko_form"] += 1
        if c in hunums:
            h = hunums[c]
            if h.get("훈") or h.get("음"):
                item["ko_main"] = {"hun": h.get("훈", ""), "eum": h.get("음", "")}
            if h.get("그밖의 훈음"):
                item["ko_more"] = parse_more(h["그밖의 훈음"])
            if h.get("일본 고유 한자", "").upper() == "Y":
                item["kokuji"] = True
                item["ko_main"] = None
                item["ko_more"] = []
            if h.get("뜻 풀이"):
                item["meaning_ko"] = h["뜻 풀이"]
            applied["ko_hunum"] += 1
        out.append(item)

    write_json(OUT / "kanji.json", out, compact=True)

    lock = read_json(LOCK)["sources"]
    levels: dict[str, int] = {}
    for k in out:
        levels[str(k["level"])] = levels.get(str(k["level"]), 0) + 1
    write_json(OUT / "meta.json", {
        "built_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(out),
        "levels": levels,
        "chapter_size": 20,
        # 검색용 다른 자형 → 상용한자 id (SPEC 2.4). 상용한자표 대체 자형 + 승인된 한국 정자체
        "aliases": {
            **{alt: off for off, alt in read_json(BUILD / "build_kanji_meta.json")["joyo_aliases"].items()},
            **{k["ko_form"]: k["id"] for k in out if k["ko_form"]},
        },
        "sources": [
            {k: v for k, v in s.items() if k in ("attribution", "license", "license_url", "url", "version")}
            for s in lock.values()
        ],
    })
    write_json(BUILD / "apply_overrides_meta.json", {"applied": applied, "errors": errors})

    for e in errors:
        print(f"[문제] {e}")
    print(f"apply_overrides : {len(out)}자 → public/data/kanji.json (반영 : 정자체 {applied['ko_form']}, 훈음 {applied['ko_hunum']})")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
