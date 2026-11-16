import { describe, expect, it } from 'vitest';
import {
  buildSettings,
  defaultSettings,
  featureDefs,
  isValidValue,
  settingDefs,
  settingKeys,
  type SettingKey,
} from './definitions';

/** SPEC 7.1~7.4 표의 키와 기본값을 그대로 옮긴 것 */
const specDefaults: Record<string, unknown> = {
  // 7.1
  f1_hunum: true,
  f2_ko_form: true,
  f3_sound_rule: true,
  f4_phonetic: true,
  f5_srs: true,
  f6_three_grade: true,
  f7_reverse: false,
  f8_similar: true,
  f9_words: true,
  f10_stroke: true,
  f11_tts: true,
  f12_stats: true,
  // 7.2
  srs_new_per_day: 20,
  srs_review_cap: 100,
  srs_retention: 0.9,
  reverse_types: 'both',
  reverse_ratio: 0.3,
  similar_auto_open: true,
  words_count: 2,
  stroke_speed: 'normal',
  stroke_numbers: true,
  tts_auto: false,
  tts_rate: 'normal',
  daily_goal: 20,
  // 7.3
  chapter_size: 20,
  session_size: 20,
  card_order: 'shuffle',
  level_lock: true,
  auto_reveal: 'none',
  swipe_enabled: true,
  longpress_graduate: true,
  // 7.4
  theme: 'system',
  kanji_font: 'textbook',
  kanji_size: 'normal',
  haptics: true,
  sound_fx: false,
};

describe('설정 정의 (SPEC 7장)', () => {
  it('키 목록이 SPEC 7장 표와 정확히 같다', () => {
    expect([...settingKeys].sort()).toEqual(Object.keys(specDefaults).sort());
  });

  it('기본값이 SPEC 7장 표와 같다', () => {
    expect(defaultSettings).toEqual(specDefaults);
  });

  it('기능 스위치는 F1~F12 12개다', () => {
    expect(Object.keys(featureDefs)).toHaveLength(12);
  });

  it('하위 옵션의 소속은 모두 기능 스위치 키다', () => {
    for (const key of settingKeys) {
      const parent = settingDefs[key].parent;
      if (parent !== undefined) expect(Object.keys(featureDefs)).toContain(parent);
    }
  });

  it('모든 기본값은 허용되는 값이다', () => {
    for (const key of settingKeys) {
      expect(isValidValue(key, defaultSettings[key])).toBe(true);
    }
  });
});

describe('buildSettings', () => {
  it('저장된 값이 없으면 기본값', () => {
    expect(buildSettings([])).toEqual(defaultSettings);
  });

  it('저장된 올바른 값은 반영한다', () => {
    const s = buildSettings([
      { key: 'theme', value: 'dark' },
      { key: 'f7_reverse', value: true },
      { key: 'srs_review_cap', value: null },
    ]);
    expect(s.theme).toBe('dark');
    expect(s.f7_reverse).toBe(true);
    expect(s.srs_review_cap).toBeNull();
  });

  it('모르는 키와 허용되지 않는 값은 버린다', () => {
    const s = buildSettings([
      { key: 'unknown_key', value: 1 },
      { key: 'theme', value: 'blue' },
      { key: 'f1_hunum', value: 'yes' },
      { key: 'chapter_size' as SettingKey, value: 25 },
    ]);
    expect(s).toEqual(defaultSettings);
    expect('unknown_key' in s).toBe(false);
  });
});
