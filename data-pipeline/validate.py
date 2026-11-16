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

    report = [
        "# M1 빌드 보고서",
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
