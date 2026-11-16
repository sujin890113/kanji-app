/**
 * 장 잠금과 진도 (SPEC 2.1의 7, 4.3 단계 잠금)
 * - 잠금 켬 : 급수 순서(N5 → N1 → 보충)대로, 앞 급수의 모든 장을 완료해야 다음 급수가 열린다.
 *   급수 안에서는 앞 장을 완료해야 다음 장이 열린다.
 * - 잠금 끔 : 모든 장이 열린다.
 */

export const LEVEL_ORDER = [5, 4, 3, 2, 1, 0] as const;

export interface LevelOutline {
  level: number;
  /** 장 수 */
  chapters: number;
}

export const chapterKey = (level: number, chapter: number) => `${level}:${chapter}`;

export function sortLevels<T extends { level: number }>(levels: readonly T[]): T[] {
  return [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a.level as never) - LEVEL_ORDER.indexOf(b.level as never));
}

/** 열린 장의 키 집합 */
export function unlockedChapters(
  levels: readonly LevelOutline[],
  completed: ReadonlySet<string>,
  lock: boolean,
): Set<string> {
  const open = new Set<string>();
  let levelOpen = true;
  for (const { level, chapters } of sortLevels(levels)) {
    for (let ch = 1; ch <= chapters; ch++) {
      const prevDone = ch === 1 || completed.has(chapterKey(level, ch - 1));
      if (!lock || (levelOpen && prevDone)) open.add(chapterKey(level, ch));
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
): { level: number; chapter: number } | null {
  const open = unlockedChapters(levels, completed, lock);
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
