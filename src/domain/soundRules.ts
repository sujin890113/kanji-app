/**
 * 음 대응 규칙 (SPEC 2.3 F3). 규칙 정의는 빌드가 sound_rules.json으로 내보낸다.
 * 한자별 해당 규칙은 빌드에서 정해 kanji.json의 rules에 들어 있다. 여기서는 화면에 보여줄
 * "어느 음독이 규칙에 맞는가"만 계산한다. 패턴 문법은 data-pipeline/build_relations.py와 같다.
 *   ko_pattern  "받침:ㄱ" "받침:ㄴ|ㅁ" "초성:ㅎ"
 *   ja_pattern  "끝:ク|キ" (음독의 마지막 글자)  "행:カ|ガ" (음독 첫 글자의 행)
 */

export interface SoundRule {
  id: string;
  title: string;
  ko_pattern: string;
  ja_pattern: string;
  description: string;
  examples: string[];
  count?: number;
}

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const ROWS: Record<string, string> = {
  カ: 'カキクケコ',
  ガ: 'ガギグゲゴ',
  サ: 'サシスセソ',
  ザ: 'ザジズゼゾ',
  タ: 'タチツテト',
  ダ: 'ダヂヅデド',
  ナ: 'ナニヌネノ',
  ハ: 'ハヒフヘホ',
  バ: 'バビブベボ',
  パ: 'パピプペポ',
  マ: 'マミムメモ',
  ヤ: 'ヤユヨ',
  ラ: 'ラリルレロ',
  ワ: 'ワヲ',
};

/** 한글 음절 → [초성, 받침]. 한글 음절 하나가 아니면 null */
export function jamo(syllable: string): [string, string] | null {
  if (syllable.length !== 1) return null;
  const code = syllable.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return [INITIALS[Math.floor(code / 588)], FINALS[code % 28]];
}

function split(pattern: string): [string, string[]] {
  const i = pattern.indexOf(':');
  return [pattern.slice(0, i), pattern.slice(i + 1).split('|')];
}

export function koMatches(pattern: string, eum: string): boolean {
  const j = jamo(eum);
  if (!j) return false;
  const [kind, values] = split(pattern);
  return values.includes(kind === '받침' ? j[1] : j[0]);
}

export function jaMatches(pattern: string, on: string): boolean {
  if (!on) return false;
  const [kind, values] = split(pattern);
  if (kind === '끝') return values.includes(on[on.length - 1]);
  return values.some((r) => (ROWS[r] ?? '').includes(on[0]));
}

/** 규칙에 맞는 음독들 (힌트 줄에 "첩 → チョウ"처럼 보여줄 때) */
export function matchingReadings(rule: SoundRule, on: readonly string[]): string[] {
  return on.filter((o) => jaMatches(rule.ja_pattern, o));
}
