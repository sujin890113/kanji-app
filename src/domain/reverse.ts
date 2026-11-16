/**
 * F7 역방향 출제 (SPEC 2.2 F7, 4.3). 화면·DB 코드에 의존하지 않는다.
 * - 정방향에서 '알고있음'을 1회 이상 받은 한자만 대상이다.
 * - 역방향 카드는 정방향과 별도의 카드(direction = reverse)로 스케줄한다.
 * - 세션의 정방향 카드 사이에 비율(reverse_ratio)만큼 고르게 끼워 넣는다.
 */

import { isKnownOnce } from './progress';
import { formatKun } from './session';
import { isDue } from './srs';
import type { CardState, Rng } from './types';

export type ReverseType = 'ko' | 'kana';
export type ReverseSetting = ReverseType | 'both';

/** 세션에 끼워 넣을 역방향 카드. at : 정방향 카드를 이만큼 판정한 뒤에 낸다 */
export interface ReverseItem {
  id: string;
  type: ReverseType;
  at: number;
}

/** 역방향 문제를 만드는 데 필요한 한자 정보 */
export interface ReverseSource {
  id: string;
  on: readonly string[];
  kun: readonly string[];
  ko_main: { hun: string; eum: string } | null;
}

/**
 * 역방향 후보 (ids 순서 기준).
 * - 간격 반복(F5 켬) : 역방향 카드가 없거나 새 카드이거나 오늘 출제일. 출제일이 지난 카드가 먼저.
 * - 회독(F5 끔) : 역방향에서 아직 '알고있음'을 받지 않은 카드. 학습 중인 카드가 먼저.
 */
export function reverseCandidates(input: {
  ids: readonly string[];
  forward: ReadonlyMap<string, CardState>;
  reverse: ReadonlyMap<string, CardState>;
  srs: boolean;
  now: number;
}): string[] {
  const { ids, forward, reverse, srs, now } = input;
  const started: { id: string; due: number }[] = [];
  const fresh: string[] = [];
  for (const id of ids) {
    if (!isKnownOnce(forward.get(id))) continue;
    const r = reverse.get(id);
    if (!r || r.status === 'new') fresh.push(id);
    else if (srs ? isDue(r, now) : r.status === 'learning') started.push({ id, due: r.due ?? Number.NEGATIVE_INFINITY });
  }
  started.sort((a, b) => a.due - b.due);
  return [...started.map((s) => s.id), ...fresh];
}

/** 정방향 forwardCount장에 비율 ratio가 되도록 더할 역방향 카드 수 (후보 수를 넘지 않음) */
export function reverseCount(forwardCount: number, ratio: number, available: number): number {
  if (forwardCount <= 0 || ratio <= 0 || available <= 0) return 0;
  const r = Math.min(ratio, 0.9);
  return Math.min(available, Math.max(1, Math.round((forwardCount * r) / (1 - r))));
}

/** 이 한자로 낼 수 있는 유형 중 하나 (설정이 '둘 다'면 무작위). 낼 수 없으면 null */
export function pickType(k: ReverseSource, setting: ReverseSetting, rng: Rng): ReverseType | null {
  const can: ReverseType[] = [];
  if (k.ko_main) can.push('ko');
  if (k.kun.length > 0 || k.on.length > 0) can.push('kana');
  const want = setting === 'both' ? can : can.filter((t) => t === setting);
  // 원하는 유형을 낼 수 없으면 다른 유형으로 낸다 (예 : 한국 훈음이 없는 한자)
  const pool = want.length > 0 ? want : can;
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** 정방향 forwardCount장 사이에 count장을 고르게 놓을 위치 (판정한 정방향 수) */
export function spreadPositions(forwardCount: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.max(1, Math.round(((i + 1) * forwardCount) / (count + 1))));
}

/** 세션에 끼워 넣을 역방향 카드 목록 */
export function planReverse(input: {
  candidates: readonly string[];
  sources: ReadonlyMap<string, ReverseSource>;
  forwardCount: number;
  ratio: number;
  setting: ReverseSetting;
  rng: Rng;
}): ReverseItem[] {
  const { candidates, sources, forwardCount, ratio, setting, rng } = input;
  const typed: { id: string; type: ReverseType }[] = [];
  for (const id of candidates) {
    const k = sources.get(id);
    const type = k ? pickType(k, setting, rng) : null;
    if (type) typed.push({ id, type });
  }
  const n = reverseCount(forwardCount, ratio, typed.length);
  const at = spreadPositions(forwardCount, n);
  return typed.slice(0, n).map((t, i) => ({ ...t, at: at[i] }));
}

/** 가타카나 → 히라가나 */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 역방향 카드 앞면 글.
 * - ko : 대표 한국 훈음 ("나그네 려")
 * - kana : 훈독(오쿠리가나는 괄호, 접사 표시 - 는 지움) 최대 3개. 훈독이 없으면 음독을 히라가나로.
 */
export function reversePrompt(k: ReverseSource, type: ReverseType): string[] {
  if (type === 'ko') return k.ko_main ? [`${k.ko_main.hun} ${k.ko_main.eum}`] : [];
  const kun = [...new Set(k.kun.map((r) => formatKun(r.replace(/^-|-$/g, ''))))].slice(0, 3);
  if (kun.length > 0) return kun;
  return [...new Set(k.on.map((r) => toHiragana(r.replace(/^-|-$/g, ''))))].slice(0, 3);
}
