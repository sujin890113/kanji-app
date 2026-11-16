/**
 * 옵션 정의와 기본값 (SPEC 7장 표와 1:1)
 * 12개 기능(F1~F12)은 이 파일의 키로만 켜고 끈다. 키 이름은 SPEC 7장 표와 같게 유지한다.
 */

export interface Choice<T> {
  value: T;
  label: string;
}

interface SwitchDef {
  kind: 'switch';
  label: string;
  default: boolean;
  /** 하위 옵션이면 소속 기능 스위치 키 (FeatureKey). 테스트에서 검사한다 */
  parent?: string;
}

interface SelectDef<T> {
  kind: 'select';
  label: string;
  default: T;
  choices: readonly Choice<T>[];
  parent?: string;
}

type Def = SwitchDef | SelectDef<unknown>;

const sw = (label: string, def: boolean, parent?: string): SwitchDef => ({
  kind: 'switch',
  label,
  default: def,
  parent,
});

const sel = <T>(label: string, def: T, choices: readonly Choice<T>[], parent?: string): SelectDef<T> => ({
  kind: 'select',
  label,
  default: def,
  choices,
  parent,
});

/* ---------- 7.1 기능 켜기·끄기 ---------- */
export const featureDefs = {
  f1_hunum: sw('한일 음훈 병기', true),
  f2_ko_form: sw('신자체-정자체 대조', true),
  f3_sound_rule: sw('음 대응 규칙 힌트', true),
  f4_phonetic: sw('같은 음부 묶음', true),
  f5_srs: sw('간격 반복', true),
  f6_three_grade: sw('3단계 자기평가', true),
  f7_reverse: sw('역방향 출제', false),
  f8_similar: sw('유사 한자 비교', true),
  f9_words: sw('대표 단어', true),
  f10_stroke: sw('획순 및 따라 쓰기', true),
  f11_tts: sw('발음 음성', true),
  f12_stats: sw('학습 통계', true),
} as const;

export type FeatureKey = keyof typeof featureDefs;

/* ---------- 7.2 하위 옵션 ---------- */
export const subOptionDefs = {
  srs_new_per_day: sel(
    '하루 새 한자 수',
    20,
    [5, 10, 20, 30, 50].map((n) => ({ value: n, label: `${n}자` })),
    'f5_srs',
  ),
  srs_review_cap: sel<number | null>(
    '하루 복습 상한',
    100,
    [
      { value: 50, label: '50' },
      { value: 100, label: '100' },
      { value: 200, label: '200' },
      { value: null, label: '제한 없음' },
    ],
    'f5_srs',
  ),
  srs_retention: sel(
    '목표 기억률',
    0.9,
    [0.8, 0.85, 0.9, 0.95].map((n) => ({ value: n, label: `${Math.round(n * 100)}%` })),
    'f5_srs',
  ),
  reverse_types: sel(
    '출제 유형',
    'both' as 'ko' | 'kana' | 'both',
    [
      { value: 'ko', label: '한국 훈음 → 한자' },
      { value: 'kana', label: '히라가나 → 한자' },
      { value: 'both', label: '둘 다' },
    ],
    'f7_reverse',
  ),
  reverse_ratio: sel(
    '역방향 비율',
    0.3,
    [0.1, 0.3, 0.5].map((n) => ({ value: n, label: `${Math.round(n * 100)}%` })),
    'f7_reverse',
  ),
  similar_auto_open: sw('자주 틀리는 한자는 자동 펼침', true, 'f8_similar'),
  words_count: sel(
    '표시할 단어 수',
    2,
    [1, 2, 3].map((n) => ({ value: n, label: `${n}개` })),
    'f9_words',
  ),
  stroke_speed: sel(
    '획순 재생 속도',
    'normal' as 'slow' | 'normal' | 'fast',
    [
      { value: 'slow', label: '느림' },
      { value: 'normal', label: '보통' },
      { value: 'fast', label: '빠름' },
    ],
    'f10_stroke',
  ),
  stroke_numbers: sw('획 번호 표시', true, 'f10_stroke'),
  tts_auto: sw('펼칠 때 자동 재생', false, 'f11_tts'),
  tts_rate: sel(
    '읽는 속도',
    'normal' as 'slow' | 'normal',
    [
      { value: 'slow', label: '느림' },
      { value: 'normal', label: '보통' },
    ],
    'f11_tts',
  ),
  daily_goal: sel(
    '하루 목표 한자 수',
    20,
    [10, 20, 40, 60].map((n) => ({ value: n, label: `${n}자` })),
    'f12_stats',
  ),
} as const;

/* ---------- 7.3 학습 방식 ---------- */
export const studyDefs = {
  chapter_size: sel(
    '한 장의 한자 수',
    20,
    [10, 20, 30, 50].map((n) => ({ value: n, label: `${n}자` })),
  ),
  session_size: sel<number | 'chapter'>('한 세션의 카드 수', 20, [
    { value: 10, label: '10' },
    { value: 20, label: '20' },
    { value: 30, label: '30' },
    { value: 'chapter', label: '장 전체' },
  ]),
  card_order: sel('출제 순서', 'shuffle' as 'shuffle' | 'sequential', [
    { value: 'shuffle', label: '섞기' },
    { value: 'sequential', label: '순번대로' },
  ]),
  level_lock: sw('앞 장을 완료해야 다음 장 열림', true),
  auto_reveal: sel('카드가 뜨면 자동으로 펼침', 'none' as 'none' | 'ko' | 'reading' | 'all', [
    { value: 'none', label: '안 함' },
    { value: 'ko', label: '한국어만' },
    { value: 'reading', label: '읽기만' },
    { value: 'all', label: '전부' },
  ]),
  swipe_enabled: sw('스와이프로 판정', true),
  longpress_graduate: sw('길게 눌러 졸업', true),
} as const;

/* ---------- 7.4 화면 ---------- */
export const displayDefs = {
  theme: sel('테마', 'system' as 'light' | 'dark' | 'system', [
    { value: 'light', label: '라이트' },
    { value: 'dark', label: '다크' },
    { value: 'system', label: '기기 설정 따름' },
  ]),
  kanji_font: sel('한자 글꼴', 'textbook' as 'textbook' | 'mincho' | 'gothic', [
    { value: 'textbook', label: '교과서체' },
    { value: 'mincho', label: '명조' },
    { value: 'gothic', label: '고딕' },
  ]),
  kanji_size: sel('카드 한자 크기', 'normal' as 'normal' | 'large', [
    { value: 'normal', label: '보통' },
    { value: 'large', label: '크게' },
  ]),
  haptics: sw('진동', true),
  sound_fx: sw('효과음', false),
} as const;

export const settingDefs = {
  ...featureDefs,
  ...subOptionDefs,
  ...studyDefs,
  ...displayDefs,
} as const;

type Defs = typeof settingDefs;
export type SettingKey = keyof Defs;
export type Settings = { [K in SettingKey]: Defs[K]['default'] };

export const settingKeys = Object.keys(settingDefs) as SettingKey[];

export const defaultSettings: Settings = Object.fromEntries(
  settingKeys.map((k) => [k, settingDefs[k].default]),
) as Settings;

/** 값이 해당 항목에서 허용되는 값인지 검사한다. */
export function isValidValue(key: SettingKey, value: unknown): boolean {
  const def: Def = settingDefs[key];
  if (def.kind === 'switch') return typeof value === 'boolean';
  return def.choices.some((c) => c.value === value);
}

/**
 * 저장소에서 읽은 값 목록을 설정 객체로 만든다.
 * 모르는 키와 허용되지 않는 값은 버리고 기본값을 쓴다.
 */
export function buildSettings(rows: readonly { key: string; value: unknown }[]): Settings {
  const result: Record<string, unknown> = { ...defaultSettings };
  for (const { key, value } of rows) {
    if (key in settingDefs && isValidValue(key as SettingKey, value)) {
      result[key] = value;
    }
  }
  return result as Settings;
}
