/**
 * 검색 (SPEC 2.4, S9). 한자, 한국 음(첩), 한국 훈(붙이다), 가나(はる, チョウ), 다른 자형(叱, 國)을 한 창에서 찾는다.
 * 화면 코드와 상관없는 순수 함수다.
 */

export interface SearchItem {
  id: string;
  on: readonly string[];
  kun: readonly string[];
  ko_main: { hun: string; eum: string } | null;
  ko_more: readonly { hun: string; eum: string }[];
}

/** 일치 정도. 숫자가 작을수록 앞에 놓는다 */
export const MATCH = {
  kanji: 0,
  exact: 1,
  prefix: 2,
} as const;

export interface SearchHit {
  id: string;
  rank: number;
  /** 무엇으로 찾았는지 (화면 표시용) */
  via: 'kanji' | 'alias' | 'eum' | 'hun' | 'on' | 'kun';
}

/** 히라가나 → 가타카나. 그 밖의 글자는 그대로 */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 훈독 표기에서 오쿠리가나 점과 접사 표시(-)를 지우고 가타카나로 */
export function normalizeKana(text: string): string {
  return toKatakana(text.replace(/[.\-・\s]/g, ''));
}

const HANGUL = /^[가-힣\s]+$/;
const KANA = /^[ぁ-ゖァ-ヺー.\-・\s]+$/;

export function isHangul(text: string): boolean {
  return HANGUL.test(text);
}

export function isKana(text: string): boolean {
  return KANA.test(text);
}

/** 받침 ㄹ을 뺀 음절 (붙일 → 붙이) */
function dropRieul(syllable: string): string | null {
  const code = syllable.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171 || code % 28 !== 8) return null;
  return String.fromCharCode(syllable.charCodeAt(0) - 8);
}

/**
 * 훈의 어간 후보. 훈은 대개 관형형이다(붙일, 맑을, 배울, 나라).
 * - 그대로 : 나라
 * - 끝 음절의 ㄹ받침을 뺀 것 : 붙일 → 붙이, 배울 → 배우
 * - 끝의 '을'·'은'을 뺀 것 : 맑을 → 맑
 */
export function hunStems(hun: string): string[] {
  const h = hun.trim();
  if (!h) return [];
  const out = new Set([h]);
  const last = h[h.length - 1];
  const head = h.slice(0, -1);
  const dropped = dropRieul(last);
  if (dropped) out.add(head + dropped);
  if (h.length > 1 && (last === '을' || last === '은')) out.add(head);
  return [...out];
}

/** 입력의 어간 후보 : 그대로, 끝의 '다'를 뺀 것 (붙이다 → 붙이) */
export function queryStems(q: string): string[] {
  const out = new Set([q]);
  if (q.length > 1 && q.endsWith('다')) out.add(q.slice(0, -1));
  return [...out];
}

function hunsOf(k: SearchItem): { hun: string; eum: string }[] {
  return [...(k.ko_main ? [k.ko_main] : []), ...k.ko_more];
}

/**
 * 검색. items의 순서(급수·순번)를 같은 일치 정도 안의 순서로 쓴다.
 * - 한자 한 글자 : 그 한자, 또는 aliases(다른 자형 → 상용한자)로 바꾼 한자
 * - 한글 : 한국 음이 같거나, 훈의 어간이 같거나, 훈이 입력으로 시작
 * - 가나 : 음독·훈독(점 무시, 히라가나·가타카나 구분 없음)이 같거나 입력으로 시작
 */
export function searchKanji(
  items: readonly SearchItem[],
  query: string,
  aliases: Readonly<Record<string, string>>,
  limit = 100,
): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits = new Map<string, SearchHit>();
  const add = (hit: SearchHit) => {
    const prev = hits.get(hit.id);
    if (!prev || hit.rank < prev.rank) hits.set(hit.id, hit);
  };

  if (isHangul(q)) {
    const word = q.replace(/\s+/g, '');
    const qs = queryStems(word);
    for (const k of items) {
      for (const h of hunsOf(k)) {
        if (h.eum === word) add({ id: k.id, rank: MATCH.exact, via: 'eum' });
        const hun = h.hun.replace(/\s+/g, '');
        // '붙일 첩'처럼 훈과 음을 함께 입력한 경우
        if (hun + h.eum === word) add({ id: k.id, rank: MATCH.kanji, via: 'hun' });
        const stems = hunStems(hun);
        if (qs.some((s) => stems.includes(s))) add({ id: k.id, rank: MATCH.exact, via: 'hun' });
        else if (word.length >= 2 && hun.startsWith(word)) add({ id: k.id, rank: MATCH.prefix, via: 'hun' });
      }
    }
  } else if (isKana(q)) {
    const kq = normalizeKana(q);
    for (const k of items) {
      for (const o of k.on) {
        if (o === kq) add({ id: k.id, rank: MATCH.exact, via: 'on' });
        else if (o.startsWith(kq)) add({ id: k.id, rank: MATCH.prefix, via: 'on' });
      }
      for (const r of k.kun) {
        const n = normalizeKana(r);
        if (n === kq) add({ id: k.id, rank: MATCH.exact, via: 'kun' });
        else if (n.startsWith(kq)) add({ id: k.id, rank: MATCH.prefix, via: 'kun' });
      }
    }
  } else {
    // 한자 : 입력한 글자마다 (서로게이트 쌍 한자 𠮟도 한 글자로)
    const ids = new Set(items.map((k) => k.id));
    for (const ch of Array.from(q)) {
      if (ids.has(ch)) add({ id: ch, rank: MATCH.kanji, via: 'kanji' });
      else if (aliases[ch] && ids.has(aliases[ch])) add({ id: aliases[ch], rank: MATCH.kanji, via: 'alias' });
    }
  }

  const order = new Map(items.map((k, i) => [k.id, i]));
  return [...hits.values()]
    .sort((a, b) => a.rank - b.rank || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, limit);
}
