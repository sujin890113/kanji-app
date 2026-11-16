# 데이터 파이프라인 (SPEC 3.4)

Python 3.11 이상, 표준 라이브러리만 쓴다. 이 폴더에서 실행한다.
Windows 콘솔에서 한글이 깨지면 먼저 `set PYTHONUTF8=1`(PowerShell은 `$env:PYTHONUTF8=1`)을 실행한다.

## 빌드 순서

```bash
python fetch.py            # 1. 원본 내려받기 → raw/, SOURCES.lock
python build_kanji.py      # 2. 상용한자 2,136자, 급수·장·순번  (N5만 : --level 5)
python build_korean.py     # 3. 한국 훈음, 정자체 후보, 검수 CSV → review/
python build_words.py      # 4. 대표 단어(JMdict) → build/words.json
python build_relations.py  # 5. 음부 묶음·유사 한자(KanjiVG), 음 대응 규칙 정의 → build/
python apply_overrides.py  # 7. overrides/ 반영 → public/data/kanji.json, meta.json
python validate.py         # 8. 전수 검사 → review/build_report.md
```

스크립트 테스트(표준 라이브러리 unittest, 추가 설치 없음) :

```bash
python -m unittest discover tests
```

4단계는 `python fetch.py --only jmdict`, 5·6단계는 `python fetch.py --only kanjivg`로 원본을 먼저 받아 둔다.

### 5단계 : 관계 데이터 (F3·F4·F8)

- **음 대응 규칙** : 규칙 정의는 `overrides/sound_rules.csv`가 있으면 그것을, 없으면 SPEC 2.3 초안(build_relations.py의 `DRAFT_RULES`)을 쓴다.
  한자별 판정은 apply_overrides.py가 검수 반영 뒤 대표 음으로 한다. 일본 고유 한자는 규칙을 붙이지 않는다.
  결과는 `review/sound_rules_review.csv`(규칙별 해당 한자 수와 예시)로 나온다. 고치려면 이 파일을 복사해
  `overrides/sound_rules.csv`로 저장하고 `id, title, ko_pattern, ja_pattern, description` 열을 고친다.
  - `ko_pattern` : `받침:ㄱ`, `받침:ㄴ|ㅁ`, `초성:ㅎ`
  - `ja_pattern` : `끝:ク|キ`(음독의 마지막 글자), `행:カ|ガ`(음독 첫 글자의 행. 탁음 행은 따로 적는다)
- **음부 묶음** : KanjiVG의 `kvg:phon` 표시가 같은 구성 요소이고 같은 음독을 공유하는 상용한자 2자 이상.
- **유사 한자** : KanjiVG 구성 요소가 많이 겹치고 획수 차가 4 이하인 한자 최대 3자. 자동 계산이며 예시는 build_report.md에 있다.

## 폴더

| 폴더 | 내용 | git |
| --- | --- | --- |
| `raw/` | 내려받은 원본 | 제외 |
| `build/` | 중간 결과 | 제외 |
| `review/` | 빌드가 만든 검수용 CSV와 보고서. 빌드할 때마다 다시 만든다 | 포함 |
| `overrides/` | 사람이 검수한 결과. 빌드 스크립트는 읽기만 한다 | 포함 |
| `drafts/` | 사전 뜻을 옮긴 번역 초안(단어의 한국어 뜻). 앱에 '미검수' 표시로 나간다. 빌드 스크립트는 읽기만 한다 | 포함 |

## 검수 파일

두 검수 파일 모두 앞 세 열이 `급수, 장, 순번`이고 N5 → N4 → N3 → N2 → N1 → 보충, 장, 순번 순으로 정렬되어 있다.

### 정자체 : `review/ko_form_review.csv` → `overrides/ko_form.csv`

후보 1개가 1행이다. `구분` 열 :

- **일치** : 일본 공식 구자체(Unihan kJinmeiyoKanji) + 한국 목록(교육용·인명용) + hanja.txt 뜻, 세 근거를 모두 갖춘 후보가 정확히 1개
- **참고(일치 후보 따로 있음)** : 같은 한자에 일치 후보가 따로 있을 때 나머지 후보
- **엇갈림** : 후보는 있으나 세 근거를 다 갖춘 후보가 없거나 2개 이상
- **후보 없음** : hanja.txt에 신자체가 뜻 없이만 올라 있어(예 : 青, 清) 정자체를 직접 확인해야 하는 한자

`주의` 열은 일치여도 다시 볼 행이다(신자체도 한국 교육용 한자, 호환 한자 등).

`overrides/ko_form.csv` 형식 (UTF-8, 엑셀 가능) :

| 신자체 | 정자체 | 비고 |
| --- | --- | --- |
| 国 | 國 | |
| 野 | | 정자체 같음으로 확정 |

정자체 칸을 비우면 "한국도 같은 자형"으로 확정한다. 이 파일에 없는 한자는 ko_form = null(미검수).

**'일치' 행 한꺼번에 승인하기** (사람이 직접 실행. 빌드는 이 도구를 부르지 않는다) :

```bash
python approve_ko_form.py                           # 미리 보기 (파일을 바꾸지 않음)
python approve_ko_form.py --yes --exclude-caution   # '주의' 행은 빼고 승인
python approve_ko_form.py --yes                     # '주의' 행까지 모두 승인
```

이미 `overrides/ko_form.csv`에 있는 신자체는 건너뛰고, 기존 행은 고치지 않고 끝에 덧붙이기만 한다.
승인 뒤 `python apply_overrides.py && python validate.py`로 다시 반영한다.

### 한국 훈음 : `review/ko_hunum_review.csv` → `overrides/ko_hunum.csv`

검수 사유 : 대표 훈음 선택(훈음이 여러 개), 정자체 후보로 찾음, 훈음 없음(일본 고유 한자 후보),
공식 구자체에도 훈음이 있음, KANJIDIC2 한국 음과 다름.

`overrides/ko_hunum.csv` 형식 :

| 한자 | 훈 | 음 | 그밖의 훈음 | 일본 고유 한자 | 뜻 풀이 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| 貼 | 붙일 | 첩 | 붙을 첩 | | 붙이다 | |
| 働 | | | | Y | 일하다 | 국자 |

- 훈·음이 있으면 대표 훈음을 바꾼다. 그밖의 훈음은 `훈 음; 훈 음` 형식, 비우면 자동값 유지.
- 일본 고유 한자에 Y를 넣으면 kokuji = true가 되고 훈음은 비운다.
- 뜻 풀이(meaning_ko)는 선택 항목이다. 공개 출처가 없어 이 열로만 채우고, 비우면 카드에 훈음만 표시한다.

### 단어의 한국어 뜻 : `review/words_ko_review.csv` → `overrides/words_ko.csv`

- 뜻은 검수 값(`overrides/words_ko.csv`) → 번역 초안(`drafts/words_ko_draft*.csv`) → 없음 순으로 쓴다.
- 초안은 JMdict 영어 뜻을 옮긴 것이고, 앱에서 '미검수' 표시와 함께 보인다. 검수한 행은 표시가 없어진다.
- 검수 목록의 `상태` 열 : 검수 / 초안 / 없음.
- `overrides/words_ko.csv` 형식 (UTF-8) :

| id | 단어 | 뜻 | 비고 |
| --- | --- | --- | --- |
| 1427900-1 | 貼る | 붙이다 | |

`id`는 검수 목록의 id를 그대로 쓴다(JMdict 항목 번호-표기 번호). `단어`가 빌드와 다르면 오류로 알린다.
