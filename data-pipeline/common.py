"""파이프라인 공통 경로와 입출력 도구."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"                # 내려받은 원본 (git 제외)
BUILD = ROOT / "build"            # 중간 결과 (git 제외)
REVIEW = ROOT / "review"          # 검수용 CSV (빌드가 만든다. git 포함)
OVERRIDES = ROOT / "overrides"    # 사람이 검수한 결과 (빌드 스크립트는 읽기만 한다)
OUT = ROOT.parent / "public" / "data"
LOCK = ROOT / "SOURCES.lock"

LEVELS = [5, 4, 3, 2, 1, 0]       # N5 → N1 → 보충(0)
CHAPTER_SIZE = 20                 # SPEC 7.3 chapter_size 기본값
JOYO_COUNT = 2136


def level_name(level: int) -> str:
    return "보충" if level == 0 else f"N{level}"


def read_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    """엑셀에서 한글이 깨지지 않도록 UTF-8 BOM으로 쓴다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def raw_file(name: str) -> Path:
    """SOURCES.lock에 기록된 원본 파일 경로."""
    entry = read_json(LOCK)["sources"][name]
    return ROOT / entry["file"]
