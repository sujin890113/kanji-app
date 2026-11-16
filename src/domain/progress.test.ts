import { describe, expect, it } from 'vitest';
import { chapterKey, currentChapter, nextChapter, unlockedChapters } from './progress';
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
