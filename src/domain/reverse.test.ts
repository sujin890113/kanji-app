import { describe, expect, it } from 'vitest';
import {
  pickType,
  planReverse,
  reverseCandidates,
  reverseCount,
  reversePrompt,
  spreadPositions,
  toHiragana,
  type ReverseSource,
} from './reverse';
import { newCard } from './scheduler';
import type { CardState } from './types';

const NOW = new Date(2026, 10, 18, 9, 0, 0).getTime();
const DAY = 86_400_000;
const fwd = (id: string, over: Partial<CardState> = {}): CardState => ({ ...newCard(id), status: 'review', pass_count: 1, ...over });
const rev = (id: string, over: Partial<CardState> = {}): CardState => ({ ...newCard(id, 'reverse'), ...over });

describe('역방향 후보', () => {
  const forward = new Map([
    ['一', fwd('一')],
    ['二', fwd('二')],
    ['三', fwd('三', { status: 'learning', pass_count: 0 })], // 알고있음을 받은 적 없음
    ['四', fwd('四', { status: 'graduated', pass_count: 0 })], // 졸업은 대상
    ['五', fwd('五')],
  ]);
  const reverse = new Map([
    ['二', rev('二', { status: 'review', due: NOW - DAY })],
    ['四', rev('四', { status: 'learning', due: NOW + 3 * DAY })],
    ['五', rev('五', { status: 'graduated' })],
  ]);
  const ids = ['一', '二', '三', '四', '五', '六'];
  it('정방향에서 알고있음을 받은 한자만, 간격 반복은 출제일이 된 카드가 먼저', () => {
    expect(reverseCandidates({ ids, forward, reverse, srs: true, now: NOW })).toEqual(['二', '一']);
  });
  it('회독 방식은 역방향에서 아직 알고있음을 받지 않은 카드 (학습 중 먼저)', () => {
    expect(reverseCandidates({ ids, forward, reverse, srs: false, now: NOW })).toEqual(['四', '一']);
  });
});

describe('역방향 수와 위치', () => {
  it('비율이 되도록 더할 수 (후보 수를 넘지 않음)', () => {
    expect(reverseCount(20, 0.3, 100)).toBe(9); // 9 / 29 ≈ 31%
    expect(reverseCount(20, 0.1, 100)).toBe(2);
    expect(reverseCount(20, 0.5, 100)).toBe(20);
    expect(reverseCount(20, 0.5, 4)).toBe(4);
    expect(reverseCount(2, 0.1, 5)).toBe(1); // 적어도 1장
    expect(reverseCount(0, 0.3, 5)).toBe(0);
  });
  it('정방향 사이에 고르게', () => {
    expect(spreadPositions(20, 3)).toEqual([5, 10, 15]);
    expect(spreadPositions(1, 2)).toEqual([1, 1]);
  });
});

describe('유형과 앞면 글', () => {
  const k = (over: Partial<ReverseSource>): ReverseSource => ({
    id: '旅',
    on: ['リョ'],
    kun: ['たび'],
    ko_main: { hun: '나그네', eum: '려' },
    ...over,
  });
  it('설정대로, 낼 수 없으면 다른 유형', () => {
    expect(pickType(k({}), 'ko', () => 0.9)).toBe('ko');
    expect(pickType(k({}), 'both', () => 0)).toBe('ko');
    expect(pickType(k({}), 'both', () => 0.99)).toBe('kana');
    expect(pickType(k({ ko_main: null }), 'ko', () => 0)).toBe('kana');
    expect(pickType(k({ ko_main: null, on: [], kun: [] }), 'both', () => 0)).toBeNull();
  });
  it('한국 훈음, 훈독(오쿠리가나 괄호), 훈독이 없으면 음독을 히라가나로', () => {
    expect(reversePrompt(k({}), 'ko')).toEqual(['나그네 려']);
    expect(reversePrompt(k({ kun: ['はな.す', 'はなし', '-ばなし'] }), 'kana')).toEqual(['はな(す)', 'はなし', 'ばなし']);
    expect(reversePrompt(k({ kun: [], on: ['セイ', 'ショウ'] }), 'kana')).toEqual(['せい', 'しょう']);
    expect(toHiragana('ジョウ・ヴ')).toBe('じょう・ゔ');
  });
});

describe('세션 계획', () => {
  it('후보 중 앞에서부터 수만큼, 고른 위치에', () => {
    const sources = new Map<string, ReverseSource>([
      ['一', { id: '一', on: ['イチ'], kun: ['ひと'], ko_main: { hun: '한', eum: '일' } }],
      ['二', { id: '二', on: [], kun: [], ko_main: null }], // 낼 수 없음
      ['三', { id: '三', on: ['サン'], kun: ['み'], ko_main: { hun: '석', eum: '삼' } }],
    ]);
    const plan = planReverse({ candidates: ['一', '二', '三'], sources, forwardCount: 10, ratio: 0.3, setting: 'ko', rng: () => 0 });
    expect(plan).toEqual([
      { id: '一', type: 'ko', at: 3 },
      { id: '三', type: 'ko', at: 7 },
    ]);
  });
});
