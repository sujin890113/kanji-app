"""검수자가 직접 실행하는 승인 도구 : ko_form_review.csv의 '일치' 행을 overrides/ko_form.csv에 추가한다.

빌드(파이프라인)는 이 스크립트를 부르지 않는다. 사람이 승인할 때만 손으로 실행한다.

  python approve_ko_form.py          # 미리 보기만 (아무 파일도 바꾸지 않음)
  python approve_ko_form.py --yes    # 승인 : overrides/ko_form.csv 끝에 추가
  python approve_ko_form.py --yes --exclude-caution   # '주의' 표시 행은 빼고 승인

규칙
  - 기존 행은 고치거나 지우지 않는다. 끝에 덧붙이기만 한다.
  - overrides/ko_form.csv에 이미 있는 신자체는 건너뛴다 (사람이 고친 값을 덮어쓰지 않음).
  - 파일이 없으면 머리글과 함께 새로 만든다.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys

from common import OVERRIDES, REVIEW, read_csv

HEADER = ["신자체", "정자체", "비고"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="실제로 overrides/ko_form.csv에 추가")
    ap.add_argument("--exclude-caution", action="store_true", help="'주의' 열이 있는 행은 빼기")
    args = ap.parse_args()

    review = read_csv(REVIEW / "ko_form_review.csv")
    target = OVERRIDES / "ko_form.csv"
    existing = {r["신자체"] for r in read_csv(target)} if target.exists() else set()

    picks = [r for r in review if r["구분"] == "일치"]
    new = [r for r in picks if r["신자체"] not in existing]
    skipped = len(picks) - len(new)

    caution = [r for r in new if r["주의"]]
    if args.exclude_caution:
        new = [r for r in new if not r["주의"]]
    print(f"'일치' 행 {len(picks)}개, 이미 있어 건너뜀 {skipped}개, 추가 대상 {len(new)}개")
    print(f"  '주의' 표시 {len(caution)}개{' (제외함)' if args.exclude_caution else ' (포함됨)'} :")
    for r in caution:
        print(f"    {r['신자체']}→{r['정자체 후보']}  {r['주의']}")
    if not args.yes:
        print("미리 보기입니다. 승인하려면 --yes 를 붙여 다시 실행하세요.")
        return 0

    today = dt.date.today().isoformat()
    write_header = not target.exists()
    with target.open("a", encoding="utf-8-sig" if write_header else "utf-8", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(HEADER)
        for r in new:
            w.writerow([r["신자체"], r["정자체 후보"], f"일치 일괄 승인 {today}"])
    print(f"{target} 에 {len(new)}행을 추가했습니다. 다시 빌드하면 반영됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
