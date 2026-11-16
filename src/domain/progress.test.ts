import { describe, expect, it } from 'vitest';
import {
  chapterDoneByCards,
  chapterKey,
  chunkIds,
  currentChapter,
  isKnownOnce,
  nextChapter,
  rechunkProgress,
  summarizeChapters,
  unlockedChapters,
} from './progress';
import { newCard } from './scheduler';
import type { CardState } from './types';
import { addCount, capElapsed, dateKey, emptyCounts, formatKun, sessionLimit } from './session';

const LEVELS = [
  { level: 4, chapters: 2 },
  { level: 5, chapters: 3 },
  { level: 0, chapters: 1 },
];

describe('장 잠금', () => {
  it('처음에는 N5 1장만 열린다', () => {
    expect([...unlockedChapters(LEVELS, new Set(), true)]).toEqual([chapterKey(5, 1)]);
  });

  it('앞 장을 완료하면 다음 장이 열린다', () => {
    const open = unlockedChapters(LEVELS, new Set([chapterKey(5, 1)]), true);
    expect(open.has(chapterKey(5, 2))).toBe(true);
    expect(open.has(chapterKey(5, 3))).toBe(false);
    expect(open.has(chapterKey(4, 1))).toBe(false);
  });

  it('급수의 모든 장을 완료해야 다음 급수가 열린다', () => {
    const done = new Set([chapterKey(5, 1), chapterKey(5, 2), chapterKey(5, 3)]);
    const open = unlockedChapters(LEVELS, done, true);
    expect(open.has(chapterKey(4, 1))).toBe(true);
    expect(open.has(chapterKey(4, 2))).toBe(false);
    expect(open.has(chapterKey(0, 1))).toBe(false);
  });

  it('잠금을 끄면 모든 장이 열린다', () => {
    expect(unlockedChapters(LEVELS, new Set(), false).size).toBe(6);
  });

  it('지금 학습할 장 : 열려 있고 완료하지 않은 첫 장', () => {
    expect(currentChapter(LEVELS, new Set(), true)).toEqual({ level: 5, chapter: 1 });
    expect(currentChapter(LEVELS, new Set([chapterKey(5, 1)]), true)).toEqual({ level: 5, chapter: 2 });
    const all = new Set(['5:1', '5:2', '5:3', '4:1', '4:2', '0:1']);
    expect(currentChapter(LEVELS, all, true)).toBeNull();
  });

  it('다음 장 : 급수 끝이면 다음 급수 1장', () => {
    expect(nextChapter(LEVELS, 5, 2)).toEqual({ level: 5, chapter: 3 });
    expect(nextChapter(LEVELS, 5, 3)).toEqual({ level: 4, chapter: 1 });
    expect(nextChapter(LEVELS, 0, 1)).toBeNull();
  });
});

describe('세션 규칙', () => {
  it('걸린 시간은 60초에서 자른다', () => {
    expect(capElapsed(1500)).toBe(1500);
    expect(capElapsed(120_000)).toBe(60_000);
    expect(capElapsed(-5)).toBe(0);
    expect(capElapsed(Number.NaN)).toBe(0);
  });

  it('세션 한도 : 장 전체면 제한 없음', () => {
    expect(sessionLimit(20)).toBe(20);
    expect(sessionLimit('chapter')).toBe(Number.POSITIVE_INFINITY);
  });

  it('판정 수 : 졸업은 알고있음으로 센다', () => {
    let c = emptyCounts();
    c = addCount(c, 'study');
    c = addCount(c, 'know');
    c = addCount(c, 'graduate');
    expect(c).toEqual({ study: 1, vague: 0, know: 2 });
  });

  it('날짜 키는 YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 10, 6, 23, 59).getTime())).toBe('2026-11-06');
  });

  it('훈독 표기 : 오쿠리가나를 괄호로', () => {
    expect(formatKun('は.る')).toBe('は(る)');
    expect(formatKun('くに')).toBe('くに');
    expect(formatKun('-こ.む')).toBe('-こ(む)');
  });
});

describe('장 크기 변경과 잠금 (SPEC 7.3)', () => {
  const known = (id: string): CardState => ({ ...newCard(id), status: 'review', pass_count: 1 });
  const seen = (id: string): CardState => ({ ...newCard(id), status: 'learning', study_marks: 1 });
  const IDS = Array.from({ length: 40 }, (_, i) => `k${i}`);

  it('size개씩 나누고 마지막 장은 모자랄 수 있다', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunkIds([1], 0)).toThrow();
  });

  it('완료 여부는 한자별 학습 상태로 다시 계산한다', () => {
    // 20자 장 기준 1장(k0~k19) 완료, 2장은 k20~k24만 학습
    const cards = new Map<string, CardState>();
    IDS.slice(0, 20).forEach((id) => cards.set(id, known(id)));
    IDS.slice(20, 25).forEach((id) => cards.set(id, seen(id)));
    // 10자로 바꾸면 1·2장 완료, 3장 학습 중, 4장 미학습
    const ch10 = chunkIds(IDS, 10).map((ids, i) => ({ level: 5, chapter: i + 1, ids }));
    const rows = rechunkProgress(ch10, cards, 7);
    expect(rows.map((r) => r.chapter)).toEqual([1, 2]);
    expect(rows.every((r) => r.pass_count === 0 && r.completed_at === 7)).toBe(true);
  });

  it('학습한 한자가 든 장은 앞 장이 미완료여도 잠기지 않는다', () => {
    // 1장 완료, 2장의 뒷부분만 학습 → 10자 장으로 바꾸면 3장 미완료, 4장에도 학습한 한자
    const cards = new Map<string, CardState>();
    IDS.slice(0, 20).forEach((id) => cards.set(id, known(id)));
    ['k25', 'k31', 'k32'].forEach((id) => cards.set(id, seen(id)));
    const ch10 = chunkIds(IDS, 10).map((ids, i) => ({ level: 5, chapter: i + 1, ids }));
    const s = summarizeChapters(ch10, [{ level: 5, chapters: 4 }], [], cards, true);
    expect([...s.completed]).toEqual(['5:1', '5:2']);
    expect(s.open.has('5:3')).toBe(true);
    expect(s.open.has('5:4')).toBe(true); // 3장 미완료지만 학습한 한자가 있음
    expect(s.current).toEqual({ level: 5, chapter: 3 });

    // 50자로 합치면 1장 하나 : 미완료지만 열림
    const ch50 = chunkIds(IDS, 50).map((ids, i) => ({ level: 5, chapter: i + 1, ids }));
    const s50 = summarizeChapters(ch50, [{ level: 5, chapters: 1 }], [], cards, true);
    expect(s50.open.has('5:1')).toBe(true);
    expect(s50.completed.size).toBe(0);
  });

  it('간격 반복 기준 : 알고있음을 1회 이상 받았으면 지금 learning이어도 완료로 본다', () => {
    const relearn: CardState = { ...newCard('a'), status: 'learning', pass_count: 1 };
    expect(isKnownOnce(relearn)).toBe(true);
    expect(chapterDoneByCards(['a'], new Map([['a', relearn]]))).toBe(true);
    expect(chapterDoneByCards([], new Map())).toBe(false);
  });
});
