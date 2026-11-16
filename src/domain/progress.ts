/**
 * 장 잠금과 진도 (SPEC 2.1의 7, 4.3 단계 잠금, 7.3 chapter_size)
 * - 잠금 켬 : 급수 순서(N5 → N1 → 보충)대로, 앞 급수의 모든 장을 완료해야 다음 급수가 열린다.
 *   급수 안에서는 앞 장을 완료해야 다음 장이 열린다.
 *   단, 이미 학습한 한자가 들어 있는 장은 언제나 열려 있다 (장 크기를 바꿔도 학습한 범위가 다시 잠기지 않게).
 * - 잠금 끔 : 모든 장이 열린다.
 * - 장 완료는 저장된 진행 기록 또는 한자별 학습 상태(모든 한자가 '알고있음'을 1회 이상 받았거나 졸업)로 판단한다.
 */

import type { CardState, ChapterProgress } from './types';

export const LEVEL_ORDER = [5, 4, 3, 2, 1, 0] as const;

export interface LevelOutline {
  level: number;
  /** 장 수 */
  chapters: number;
}

export interface ChapterIds {
  level: number;
  chapter: number;
  ids: readonly string[];
}

export const chapterKey = (level: number, chapter: number) => `${level}:${chapter}`;

export function sortLevels<T extends { level: number }>(levels: readonly T[]): T[] {
  return [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a.level as never) - LEVEL_ORDER.indexOf(b.level as never));
}

/** 급수 안 순번 순서의 한자를 size개씩 나눈다 (마지막 장은 모자랄 수 있음) */
export function chunkIds<T>(ids: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`장 크기가 올바르지 않습니다: ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** '알고있음'을 1회 이상 받았거나 졸업한 한자인가 (SPEC 4.2 장 완료 기준) */
export function isKnownOnce(card: CardState | undefined): boolean {
  return !!card && (card.status === 'graduated' || card.status === 'review' || card.pass_count > 0);
}

/** 한 번이라도 판정한 한자인가 */
export function isTouched(card: CardState | undefined): boolean {
  return !!card && card.status !== 'new';
}

/** 한자별 학습 상태로 본 장 완료 여부 */
export function chapterDoneByCards(ids: readonly string[], cards: ReadonlyMap<string, CardState>): boolean {
  return ids.length > 0 && ids.every((id) => isKnownOnce(cards.get(id)));
}

/** 열린 장의 키 집합. touched : 학습한 한자가 들어 있는 장 (잠금과 상관없이 열림) */
export function unlockedChapters(
  levels: readonly LevelOutline[],
  completed: ReadonlySet<string>,
  lock: boolean,
  touched: ReadonlySet<string> = new Set(),
): Set<string> {
  const open = new Set<string>();
  let levelOpen = true;
  for (const { level, chapters } of sortLevels(levels)) {
    for (let ch = 1; ch <= chapters; ch++) {
      const key = chapterKey(level, ch);
      const prevDone = ch === 1 || completed.has(chapterKey(level, ch - 1));
      if (!lock || (levelOpen && prevDone) || touched.has(key) || completed.has(key)) open.add(key);
    }
    let allDone = true;
    for (let ch = 1; ch <= chapters; ch++) {
      if (!completed.has(chapterKey(level, ch))) allDone = false;
    }
    levelOpen = levelOpen && allDone;
  }
  return open;
}

/** 지금 학습할 장 : 급수 순서대로 열려 있고 완료하지 않은 첫 장. 모두 완료면 null */
export function currentChapter(
  levels: readonly LevelOutline[],
  completed: ReadonlySet<string>,
  lock: boolean,
  touched: ReadonlySet<string> = new Set(),
): { level: number; chapter: number } | null {
  const open = unlockedChapters(levels, completed, lock, touched);
  for (const { level, chapters } of sortLevels(levels)) {
    for (let ch = 1; ch <= chapters; ch++) {
      const key = chapterKey(level, ch);
      if (open.has(key) && !completed.has(key)) return { level, chapter: ch };
    }
  }
  return null;
}

/** 다음 장 (같은 급수의 다음 장, 없으면 다음 급수 1장). 마지막이면 null */
export function nextChapter(
  levels: readonly LevelOutline[],
  level: number,
  chapter: number,
): { level: number; chapter: number } | null {
  const sorted = sortLevels(levels);
  const i = sorted.findIndex((l) => l.level === level);
  if (i < 0) return null;
  if (chapter < sorted[i].chapters) return { level, chapter: chapter + 1 };
  const next = sorted[i + 1];
  return next ? { level: next.level, chapter: 1 } : null;
}

export interface ChapterSummary {
  completed: Set<string>;
  touched: Set<string>;
  open: Set<string>;
  current: { level: number; chapter: number } | null;
}

/** 진행 기록과 한자별 학습 상태로 장 완료·열림·현재 장을 계산한다 */
export function summarizeChapters(
  chapters: readonly ChapterIds[],
  outline: readonly LevelOutline[],
  rows: readonly ChapterProgress[],
  cards: ReadonlyMap<string, CardState>,
  lock: boolean,
): ChapterSummary {
  const saved = new Set(rows.filter((r) => r.completed_at !== null).map((r) => chapterKey(r.level, r.chapter)));
  const completed = new Set<string>();
  const touched = new Set<string>();
  for (const ch of chapters) {
    const key = chapterKey(ch.level, ch.chapter);
    if (saved.has(key) || chapterDoneByCards(ch.ids, cards)) completed.add(key);
    if (ch.ids.some((id) => isTouched(cards.get(id)))) touched.add(key);
  }
  return {
    completed,
    touched,
    open: unlockedChapters(outline, completed, lock, touched),
    current: currentChapter(outline, completed, lock, touched),
  };
}

/**
 * 장 크기를 바꾼 뒤의 장별 진행 기록 (SPEC 7.3).
 * 회독 수는 초기화하고, 완료 여부는 한자별 학습 상태로 다시 계산한다.
 * 완료한 장만 기록을 만들고, 나머지 장은 처음 열 때 남은 한자로 회독을 시작한다.
 */
export function rechunkProgress(
  chapters: readonly ChapterIds[],
  cards: ReadonlyMap<string, CardState>,
  now: number,
): ChapterProgress[] {
  return chapters
    .filter((ch) => chapterDoneByCards(ch.ids, cards))
    .map((ch) => ({ level: ch.level, chapter: ch.chapter, pass_count: 0, completed_at: now, round_queue: [], round_size: 0 }));
}
