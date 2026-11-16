"""1단계 : 원본 내려받기 (SPEC 3.4).

내려받은 파일은 raw/<이름>/ 에 두고, 출처 주소·버전·라이선스·SHA-256·내려받은 날짜를
SOURCES.lock에 기록한다. GitHub 원본은 커밋 번호로 고정한다.

사용법:
  python fetch.py            # M1에 필요한 원본만 (kanjidic2, kanji_data, hanja, unihan)
  python fetch.py --all      # 이후 단계 원본까지 (kanjivg, jmdict)
  python fetch.py --force    # 이미 받은 파일도 다시 받기
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from common import LOCK, RAW

UA = "kanji-app-data-pipeline/1.0"

SOURCES: dict[str, dict] = {
    "kanjidic2": {
        "milestone": "M1",
        "url": "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
        "file": "kanjidic2.xml.gz",
        "version_from": "last-modified",
        "license": "CC BY-SA 4.0 (출처 표시 필수)",
        "license_url": "https://www.edrdg.org/edrdg/licence.html",
        "attribution": "KANJIDIC2 © Electronic Dictionary Research and Development Group",
        "used_fields": "상용한자 판별(grade), 획수, 음독·훈독(ja_on/ja_kun), 신문 빈도(freq), 한국 음(korean_h)",
    },
    "kanji_data": {
        "milestone": "M1",
        "url": "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/00fd7079c3890f430759536f91aa5e854ec0ca4f/kanji-jouyou.json",
        "file": "kanji-jouyou.json",
        "version": "git 00fd7079c3890f430759536f91aa5e854ec0ca4f (2026-02-27)",
        "license": "저장소 MIT. 데이터는 KANJIDIC(CC BY-SA 4.0)과 tanos JLPT 목록(Jonathan Waller)에서 나옴. wk_*(WaniKani) 항목은 쓰지 않음",
        "license_url": "https://github.com/davidluzgouveia/kanji-data/blob/00fd7079c3890f430759536f91aa5e854ec0ca4f/LICENSE",
        "attribution": "kanji-data by David Gouveia; JLPT levels from Jonathan Waller (tanos.co.uk)",
        "used_fields": "jlpt_new",
    },
    "hanja": {
        "milestone": "M1",
        "url": "https://raw.githubusercontent.com/libhangul/libhangul/717409ce61524bb3d8426060a384822f21354c62/data/hanja/hanja.txt",
        "file": "hanja.txt",
        "version": "git 717409ce61524bb3d8426060a384822f21354c62 (2026-02-15)",
        "license": "BSD-3-Clause (hanja.txt 파일 머리글). 저장소 전체는 LGPL-2.1이지만 이 파일은 머리글의 BSD-3 조항을 따름",
        "license_url": "https://github.com/libhangul/libhangul/blob/717409ce61524bb3d8426060a384822f21354c62/data/hanja/hanja.txt",
        "attribution": "hanja.txt © 2005,2006 Choe Hwanjin (libhangul)",
    },
    "unihan": {
        "milestone": "M1",
        "url": "https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip",
        "file": "Unihan.zip",
        "version": "Unicode 18.0.0",
        "license": "Unicode License V3",
        "license_url": "https://www.unicode.org/license.txt",
        "attribution": "Unihan Database © Unicode, Inc.",
        "used_fields": "kJinmeiyoKanji, kJoyoKanji, kKoreanEducationHanja, kKoreanName, kSemanticVariant, kZVariant",
    },
    "kanjivg": {
        "milestone": "M4/M5",
        "url": "https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714-main.zip",
        "file": "kanjivg-20260714-main.zip",
        "version": "r20260714",
        "license": "CC BY-SA 3.0 (출처 표시 필수)",
        "license_url": "https://github.com/KanjiVG/kanjivg/blob/master/COPYING",
        "attribution": "KanjiVG © Ulrich Apel",
    },
    "jmdict": {
        "milestone": "M5",
        "url": "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz",
        "file": "JMdict_e.gz",
        "version_from": "last-modified",
        "license": "CC BY-SA 4.0 (출처 표시 필수)",
        "license_url": "https://www.edrdg.org/edrdg/licence.html",
        "attribution": "JMdict © Electronic Dictionary Research and Development Group",
    },
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    tmp = dest.with_name(dest.name + ".part")
    with urllib.request.urlopen(req, timeout=120) as res, tmp.open("wb") as f:
        headers = dict(res.headers)
        while chunk := res.read(1 << 20):
            f.write(chunk)
    tmp.replace(dest)
    return headers


def load_lock() -> dict:
    if LOCK.exists():
        return json.loads(LOCK.read_text(encoding="utf-8"))
    return {"note": "fetch.py가 관리한다. 직접 고치지 않는다.", "sources": {}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="이후 단계 원본까지 받기")
    ap.add_argument("--force", action="store_true", help="이미 받은 파일도 다시 받기")
    args = ap.parse_args()

    lock = load_lock()
    for name, src in SOURCES.items():
        if src["milestone"] != "M1" and not args.all:
            continue
        dest_dir = RAW / name
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / src["file"]
        if dest.exists() and not args.force and name in lock["sources"]:
            print(f"[건너뜀] {name}: 이미 있음 ({dest.name})")
            continue

        print(f"[받는 중] {name}: {src['url']}")
        headers = download(src["url"], dest)
        version = src.get("version")
        if src.get("version_from") == "last-modified":
            version = f"Last-Modified {headers.get('Last-Modified', '알 수 없음')}"
        entry = {
            "url": src["url"],
            "file": f"raw/{name}/{src['file']}",
            "version": version,
            "license": src["license"],
            "license_url": src["license_url"],
            "attribution": src["attribution"],
            "sha256": sha256(dest),
            "bytes": dest.stat().st_size,
            "fetched_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if "used_fields" in src:
            entry["used_fields"] = src["used_fields"]
        lock["sources"][name] = entry
        LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"         {entry['bytes']:,} bytes, sha256 {entry['sha256'][:12]}")

    print(f"SOURCES.lock 갱신: {LOCK}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
