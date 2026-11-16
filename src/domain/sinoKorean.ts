/**
 * 단어의 한국 한자음 (学生 → 학생). 한자마다 대표 음(ko_main.eum)을 이어 붙이고,
 * 첫 글자에만 두음법칙을 적용한다 (女子 → 여자, 旅行 → 여행, 労働 → 노동, 来年 → 내년).
 * 가나가 섞인 단어(貼る)나 한국 음이 없는 한자(働 등 일본 고유 한자)가 있으면 null.
 */

const BASE = 0xac00;
const CHO_N = 2; // ㄴ
const CHO_R = 5; // ㄹ
const CHO_NG = 11; // ㅇ
/** ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ : 이 모음 앞의 ㄴ·ㄹ은 ㅇ이 된다 */
const Y_VOWELS = new Set([2, 3, 6, 7, 12, 17, 20]);

function split(s: string): [number, number, number] | null {
  const code = s.charCodeAt(0) - BASE;
  if (s.length !== 1 || code < 0 || code > 11171) return null;
  return [Math.floor(code / 588), Math.floor((code % 588) / 28), code % 28];
}

function join(cho: number, jung: number, jong: number): string {
  return String.fromCharCode(BASE + cho * 588 + jung * 28 + jong);
}

/**
 * 두음법칙 (한글 맞춤법 제10~12항)
 * - 녀·뇨·뉴·니 → 여·요·유·이
 * - 랴·려·례·료·류·리 → 야·여·예·요·유·이
 * - 라·래·로·뢰·루·르 → 나·내·노·뇌·누·느
 */
export function applyDueum(syllable: string): string {
  const p = split(syllable);
  if (!p) return syllable;
  const [cho, jung, jong] = p;
  if (cho === CHO_R) return join(Y_VOWELS.has(jung) ? CHO_NG : CHO_N, jung, jong);
  if (cho === CHO_N && Y_VOWELS.has(jung)) return join(CHO_NG, jung, jong);
  return syllable;
}

/** 々(같은 글자 되풀이)는 앞 한자의 음을 다시 쓴다 */
export function sinoKorean(text: string, eumOf: (kanji: string) => string | null | undefined): string | null {
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    let eum: string | null | undefined;
    if (ch === '々') eum = out[out.length - 1];
    else eum = eumOf(ch);
    if (!eum || eum.length !== 1 || !split(eum)) return null;
    out.push(eum);
  }
  if (out.length === 0) return null;
  out[0] = applyDueum(out[0]);
  return out.join('');
}
