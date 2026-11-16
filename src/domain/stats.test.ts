import { describe, expect, it } from 'vitest';
import { streakDays, weekForecast } from './stats';
import { newCard } from './scheduler';
import type { CardState } from './types';

// 2026-11-18 수요일
const NOW = new Date(2026, 10, 18, 9, 0, 0).getTime();
const DAY = 86_400_000;

describe('연속 학습일', () => {
  it('오늘부터 거꾸로 이어진 날 수', () => {
    expect(streakDays(['2026-11-16', '2026-11-17', '2026-11-18'], NOW)).toBe(3);
  });
  it('오늘 아직 안 했으면 어제부터 센다', () => {
    expect(streakDays(['2026-11-16', '2026-11-17'], NOW)).toBe(2);
  });
  it('하루라도 빠지면 끊긴다', () => {
    expect(streakDays(['2026-11-15', '2026-11-17', '2026-11-18'], NOW)).toBe(2);
    expect(streakDays([], NOW)).toBe(0);
  });
});

describe('이번 주 복습 예정', () => {
  const r = (due: number | null): CardState => ({ ...newCard(String(due)), status: 'review', due });
  it('월~일 7칸, 오늘 칸에 밀린 카드 포함, 지난 날은 0', () => {
    const w = weekForecast([r(NOW - 3 * DAY), r(NOW), r(null), r(NOW + DAY), r(NOW + 2 * DAY), r(NOW + 30 * DAY), newCard('x')], NOW);
    expect(w.map((d) => d.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(w.map((d) => d.count)).toEqual([0, 0, 3, 1, 1, 0, 0]);
    expect(w.findIndex((d) => d.isToday)).toBe(2);
  });
});
