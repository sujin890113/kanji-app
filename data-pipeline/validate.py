"""8단계 : 전수 검사와 보고서 (SPEC 3.4).

검사 : 글자 수, 상용한자 목록과 일치, 중복, 필수 필드 누락, 급수 합계, 장·순번 연속성.
보고서 : review/build_report.md (콘솔에도 출력)

필수 필드 오류가 있으면 실패(종료 코드 1). 검수 대기 항목은 실패가 아니라 개수로 보고한다.
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict

from common import BUILD, CHAPTER_SIZE, JOYO_COUNT, LEVELS, OUT, REVIEW, level_name, read_json

KATAKANA = set(chr(c) for c in range(0x30A0, 0x3100))
ON_CHARS = KATAKANA | {"-"}                                   # -ノン 처럼 연음 표기에 하이픈을 쓴다
HIRAGANA_KUN = set(chr(c) for c in range(0x3040, 0x30A0)) | {".", "-"}


def main() -> int:
    data = read_json(OUT / "kanji.json")
    meta_k = read_json(BUILD / "build_kanji_meta.json")
    meta_ko = read_json(BUILD / "build_korean_meta.json")
    meta_ov = read_json(BUILD / "apply_overrides_meta.json")

    errors: list[str] = list(meta_k["problems"]) + list(meta_ov["errors"])
    notes: list[str] = []      # 오류는 아니지만 사람이 볼 것
    pending: list[str] = []    # 검수 대기
    lv_filter = meta_k["level_filter"]
    expected = JOYO_COUNT if lv_filter is None else meta_k["level_counts"][str(lv_filter)]

    if len(data) != expected:
        errors.append(f"글자 수 {len(data)} (기대 {expected})")
    dup = [c for c, n in Counter(k["id"] for k in data).items() if n > 1]
    if dup:
        errors.append(f"중복 한자 : {dup}")

    by_level: dict[int, list[dict]] = defaultdict(list)
    for k in data:
        c = k["id"]
        if len(c) != 1:
            errors.append(f"id가 한 글자가 아님 : {c!r}")
        if k["level"] not in LEVELS:
            errors.append(f"{c} : level {k['level']}")
        if not isinstance(k["strokes"], int) or k["strokes"] <= 0:
            errors.append(f"{c} : 획수 없음")
        if not k["on"] and not k["kun"]:
            errors.append(f"{c} : 음독·훈독 모두 없음")
        for r in k["on"]:
            if not set(r) <= ON_CHARS:
                errors.append(f"{c} : 음독이 가타카나가 아님 {r}")
        for r in k["kun"]:
            if set(r) <= KATAKANA | {"-"}:
                notes.append(f"{c} : KANJIDIC2가 가타카나 훈으로 실은 외래어 {r}")
            elif not set(r) <= HIRAGANA_KUN:
                errors.append(f"{c} : 훈독 형식 이상 {r}")
        if k["ko_main"] is None and not k["kokuji"]:
            pending.append(f"{c} : 한국 음 없음(hanja.txt, KANJIDIC2 모두 없음)")
        by_level[k["level"]].append(k)

    lines_level = []
    for lv in LEVELS:
        items = sorted(by_level.get(lv, []), key=lambda k: k["order"])
        if not items:
            continue
        if [k["order"] for k in items] != list(range(1, len(items) + 1)):
            errors.append(f"{level_name(lv)} : 순번이 1부터 연속되지 않음")
        for k in items:
            if k["chapter"] != (k["order"] - 1) // CHAPTER_SIZE + 1:
                errors.append(f"{k['id']} : 장 번호 불일치")
        chapters = items[-1]["chapter"]
        last = len(items) - (chapters - 1) * CHAPTER_SIZE
        lines_level.append(f"| {level_name(lv)} | {len(items)} | {chapters} | {last} |")

    total_levels = sum(len(v) for v in by_level.values())
    if total_levels != len(data):
        errors.append("급수 합계가 전체 글자 수와 다름")

    g = meta_ko["ko_form_groups"]
    p = meta_ko["hunum_paths"]
    missing_hun = sum(1 for k in data if k["ko_main"] and not k["ko_main"]["hun"])
    no_meaning = sum(1 for k in data if not k["meaning_ko"])
    no_freq = meta_k["no_freq"]

    # ---- M4 관계 데이터 (build_relations.py)
    ids = {k["id"] for k in data}
    by_id = {k["id"]: k for k in data}
    rules = read_json(OUT / "sound_rules.json")
    groups = read_json(OUT / "phonetic_groups.json")
    rule_ids = {r["id"] for r in rules["rules"]}
    group_ids = {g_["id"] for g_ in groups}
    for k in data:
        c = k["id"]
        for r in k["rules"]:
            if r not in rule_ids:
                errors.append(f"{c} : 없는 음 대응 규칙 {r}")
        if k["kokuji"] and k["rules"]:
            errors.append(f"{c} : 일본 고유 한자에 음 대응 규칙이 붙음")
        if k["phonetic"] and k["phonetic"] not in group_ids:
            errors.append(f"{c} : 없는 음부 묶음 {k['phonetic']}")
        if len(k["similar"]) > 3 or c in k["similar"] or not set(k["similar"]) <= ids:
            errors.append(f"{c} : 유사 한자 이상 {k['similar']}")
    for g_ in groups:
        if len(g_["members"]) < 2 or not set(g_["members"]) <= ids:
            errors.append(f"음부 묶음 {g_['id']} : 구성원 이상 {g_['members']}")
        for m in g_["members"]:
            if g_["reading"] not in by_id[m]["on"]:
                errors.append(f"음부 묶음 {g_['id']} : {m}에 음독 {g_['reading']} 없음")
    rel = read_json(BUILD / "relations.json")
    for c in rel["kanjivg_missing"]:
        pending.append(f"{c} : KanjiVG 자료 없음(음부·유사 한자 계산 안 됨)")
    with_rules = sum(1 for k in data if k["rules"])
    with_phon = sum(1 for k in data if k["phonetic"])
    with_sim = sum(1 for k in data if k["similar"])
    sim_examples = [k for k in data if k["similar"]][:12]

    # ---- M5 대표 단어 (build_words.py)
    words = read_json(OUT / "words.json")
    wmap = {w["id"]: w for w in words}
    rank = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4, 0: 5}
    lv_of = {k["id"]: k["level"] for k in data}
    for k in data:
        c = k["id"]
        if len(k["words"]) < 2:
            pending.append(f"{c} : 대표 단어 {len(k['words'])}개 (조건에 맞는 단어 부족)")
        for wid in k["words"]:
            w = wmap.get(wid)
            if not w:
                errors.append(f"{c} : 없는 단어 {wid}")
            elif c not in w["text"]:
                errors.append(f"{c} : 단어 {w['text']}에 이 한자가 없음")
            elif any(rank[lv_of[x]] > rank[k["level"]] for x in w["kanji"]):
                errors.append(f"{c} : 단어 {w['text']}에 더 어려운 급수의 한자가 있음")
    used = {wid for k in data for wid in k["words"]}
    for w in words:
        if w["id"] not in used:
            errors.append(f"단어 {w['id']} {w['text']} : 어느 한자에도 연결되지 않음")
    sm = read_json(BUILD / "build_strokes_meta.json")
    errors.extend(sm["problems"])
    for m in sm["stroke_count_mismatch"]:
        notes.append(f"획순 {m} (KanjiVG 자형이 상용한자표 인쇄 자형과 다를 수 있음. 앱은 KanjiVG 획을 그대로 그린다)")
    drafted = sum(1 for w in words if w["meaning_ko"] and not w["reviewed"])
    reviewed_n = sum(1 for w in words if w["reviewed"])
    by_lv: dict[int, list[int]] = {}
    for w in words:
        t = by_lv.setdefault(w["level"], [0, 0, 0])
        t[0] += 1
        t[1] += 1 if w["reviewed"] else 0
        t[2] += 1 if w["meaning_ko"] and not w["reviewed"] else 0
    big_groups = sorted(groups, key=lambda g_: -len(g_["members"]))[:8]

    report = [
        "# 빌드 보고서",
        "",
        f"- 대상 : {'전체' if lv_filter is None else level_name(lv_filter) + '만'} {len(data)}자 (기대 {expected}자)",
        f"- 결과 : {'통과' if not errors else f'실패 ({len(errors)}건)'}",
        "",
        "## 급수별 글자 수 (장 크기 20)",
        "",
        "| 급수 | 글자 수 | 장 수 | 마지막 장 글자 수 |",
        "| --- | --- | --- | --- |",
        *lines_level,
        f"| 합계 | {total_levels} | | |",
        "",
        f"신문 빈도(KANJIDIC2 freq)가 없는 상용한자 {no_freq}자는 급수 안에서 빈도 있는 한자 뒤에 획수 순으로 놓았다.",
        "",
        "## 신자체 → 정자체 후보 (review/ko_form_review.csv)",
        "",
        "| 구분 | 한자 수 |",
        "| --- | --- |",
        f"| 일치 (일본 공식 구자체 + 한국 목록 + hanja.txt 뜻) | {g['일치']} |",
        f"| 엇갈림 | {g['엇갈림']} |",
        f"| 후보 없음 | {g['후보 없음']} |",
        "",
        f"후보에서 뺀 이체자 : 근거 없음 {meta_ko['ko_form_dropped']['근거 없음']}개, "
        f"신자체가 한국 교육용 한자라 뺀 것 {meta_ko['ko_form_dropped']['신자체가 한국 교육용']}개",
        "",
        f"일치 {g['일치']}자 중 '주의' 표시 {meta_ko['ko_form_match_with_caution']}자 "
        f"(그중 신자체도 한국 교육용 한자인 것 {meta_ko['ko_form_match_shin_edu']}자). "
        "승인할 때 approve_ko_form.py --exclude-caution으로 뺄 수 있다.",
        f"승인된 정자체(overrides/ko_form.csv) 반영 : {meta_ov['applied']['ko_form']}자. 나머지는 ko_form = null",
        "",
        "## 한국 훈음 (review/ko_hunum_review.csv)",
        "",
        "| 조회 경로 | 한자 수 |",
        "| --- | --- |",
        f"| (가) 한자 그대로 hanja.txt | {p['직접']} |",
        f"| (나) 정자체 후보로 hanja.txt | {p['정자체 후보 경유']} |",
        f"| (다) 없음 → KANJIDIC2 한국 음만 | {p['없음']} |",
        "",
        f"- 검수 목록 행 수 : {meta_ko['ko_hunum_review_rows']}",
        f"- 훈 없이 음만 있는 한자 : {missing_hun}",
        f"- 뜻 풀이(meaning_ko, 선택 항목)를 채운 한자 : {len(data) - no_meaning} (비어 있으면 카드에 훈음만 표시)",
        f"- 승인된 훈음(overrides/ko_hunum.csv) 반영 : {meta_ov['applied']['ko_hunum']}자",
        "",
        "## 음 대응 규칙·음부 묶음·유사 한자 (M4)",
        "",
        f"음 대응 규칙 정의 : {rules['source']} (검수 목록 review/sound_rules_review.csv, 고칠 때 overrides/sound_rules.csv)",
        "",
        "| 규칙 | 한국 음 | 음독 | 해당 한자 수 | 예시 |",
        "| --- | --- | --- | --- | --- |",
        *(f"| {r['title']} | {r['ko_pattern'].replace('|', '·')} | {r['ja_pattern'].replace('|', '·')} | {r['count']} | {' '.join(r['examples'])} |" for r in rules["rules"]),
        "",
        f"- 규칙이 하나 이상 붙은 한자 : {with_rules}자 (판정 기준 : 검수 반영 뒤 대표 음, 일본 고유 한자 제외)",
        f"- 음부 묶음 : {len(groups)}개, 묶음에 든 한자 {with_phon}자 (KanjiVG kvg:phon + 같은 음독 공유 2자 이상)",
        "- 큰 음부 묶음 : " + ", ".join(f"{g_['component']}({g_['reading']}) {''.join(g_['members'])}" for g_ in big_groups),
        f"- 유사 한자가 있는 한자 : {with_sim}자 (KanjiVG 구성 요소 겹침 + 획수 차 4 이하, 최대 3자)",
        "",
        "유사 한자 예시 (자동 계산, 덮어쓰기 파일은 아직 없음) :",
        "",
        "| 한자 | 유사 한자 |",
        "| --- | --- |",
        *(f"| {k['id']} | {' '.join(k['similar'])} |" for k in sim_examples),
        "",
        "## 대표 단어 (M5)",
        "",
        f"단어 {len(words)}개 : 검수한 뜻 {reviewed_n}, 번역 초안(미검수 표시) {drafted}, 뜻 없음 {len(words) - reviewed_n - drafted}. "
        "검수 목록 review/words_ko_review.csv, 검수 결과 overrides/words_ko.csv",
        "",
        "| 단어 급수(가장 어려운 한자) | 단어 수 | 검수 | 초안 | 뜻 없음 |",
        "| --- | --- | --- | --- | --- |",
        *(f"| {level_name(lv)} | {t[0]} | {t[1]} | {t[2]} | {t[0] - t[1] - t[2]} |" for lv, t in sorted(by_lv.items(), key=lambda kv: rank[kv[0]])),
        "",
        "## 검수 대기 (오류 아님)",
        "",
        *(f"- {x}" for x in pending),
        *([] if pending else ["없음"]),
        "",
        "## 참고",
        "",
        *(f"- {x}" for x in notes),
        *([] if notes else ["없음"]),
        "",
        "## 오류",
        "",
        *(f"- {e}" for e in errors[:200]),
        *([] if errors else ["없음"]),
        "",
    ]
    text = "\n".join(report)
    (REVIEW / "build_report.md").write_text(text, encoding="utf-8")
    print(text)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
