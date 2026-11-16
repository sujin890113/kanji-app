import { describe, expect, it } from 'vitest';
import {
  calendarWeeks,
  countStates,
  dailyRatings,
  formatDuration,
  gridState,
  intensity,
  lastRatings,
  ratingShares,
  streakDays,
  topStudied,
  totalSeconds,
  weekForecast,
  type GridState,
} from './stats';
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

describe('격자 칸 상태', () => {
  const c = (over: Partial<CardState>): CardState => ({ ...newCard('一'), ...over });
  it('미학습 / 학습 중 / 애매 / 알고있음 / 졸업', () => {
    expect(gridState(undefined, undefined)).toBe('new');
    expect(gridState(c({}), undefined)).toBe('new');
    expect(gridState(c({ status: 'learning' }), 'study')).toBe('learning');
    expect(gridState(c({ status: 'learning' }), 'vague')).toBe('vague');
    expect(gridState(c({ status: 'review' }), 'know')).toBe('know');
    expect(gridState(c({ status: 'graduated' }), 'graduate')).toBe('graduated');
  });
  it('알고있음을 받은 적 있으면 다시 틀려도 알고있음 (장 완료 기준과 같음)', () => {
    expect(gridState(c({ status: 'learning', pass_count: 1 }), 'study')).toBe('know');
  });
  it('마지막 판정과 상태별 수', () => {
    const last = lastRatings([
      { kanji_id: '一', rating: 'vague', ts: 1 },
      { kanji_id: '二', rating: 'study', ts: 2 },
      { kanji_id: '一', rating: 'study', ts: 3 },
    ]);
    expect([...last]).toEqual([
      ['一', 'study'],
      ['二', 'study'],
    ]);
    const states: Record<string, GridState> = { 一: 'know', 二: 'vague', 三: 'new' };
    expect(countStates(['一', '二', '三', '三'], (id) => states[id])).toEqual({ new: 2, learning: 0, vague: 1, know: 1, graduated: 0 });
  });
});

describe('달력과 일별 추이', () => {
  it('목표 대비 농도', () => {
    expect([0, 1, 9, 10, 19, 20, 29, 30, 99].map((n) => intensity(n, 20))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('12주 × 7칸, 마지막 주에 오늘, 오늘 뒤는 빈칸', () => {
    const w = calendarWeeks(
      [
        { date: '2026-11-18', seconds: 0, reviewed: 25 },
        { date: '2026-08-23', seconds: 0, reviewed: 5 },
      ],
      NOW,
      20,
    );
    expect(w).toHaveLength(12);
    expect(w.every((wk) => wk.length === 7)).toBe(true);
    expect(w[0][0].date).toBe('2026-08-31'); // 11주 전 월요일
    expect(w[11][2]).toEqual({ date: '2026-11-18', count: 25, level: 3, future: false });
    expect(w[11][3].future).toBe(true);
    expect(w.flat().filter((d) => d.count > 0)).toHaveLength(1); // 범위 밖 날짜는 빠진다
  });
  it('최근 30일 판정 수 : 졸업은 알고있음에 더한다', () => {
    const logs = [
      { kanji_id: 'a', rating: 'study' as const, ts: NOW },
      { kanji_id: 'b', rating: 'graduate' as const, ts: NOW },
      { kanji_id: 'c', rating: 'vague' as const, ts: NOW - DAY },
      { kanji_id: 'd', rating: 'know' as const, ts: NOW - 40 * DAY },
    ];
    const d = dailyRatings(logs, NOW);
    expect(d).toHaveLength(30);
    expect(d[0].date).toBe('2026-10-20');
    expect(d[29]).toEqual({ date: '2026-11-18', study: 1, vague: 0, know: 1 });
    expect(d[28]).toEqual({ date: '2026-11-17', study: 0, vague: 1, know: 0 });
    expect(ratingShares(logs)).toEqual({ study: 1, vague: 1, know: 2, total: 4 });
  });
});

describe('자주 틀리는 한자와 시간', () => {
  it('공부하겠음 횟수 순, 같으면 순번 순, 0회 제외', () => {
    const c = (id: string, m: number): CardState => ({ ...newCard(id), study_marks: m });
    const order = new Map([
      ['一', 0],
      ['二', 1],
      ['三', 2],
      ['四', 3],
    ]);
    expect(topStudied([c('三', 2), c('二', 2), c('一', 5), c('四', 0)], order, 2)).toEqual([
      { id: '一', marks: 5 },
      { id: '二', marks: 2 },
    ]);
  });
  it('누적 시간과 표시', () => {
    expect(
      totalSeconds([
        { date: 'a', seconds: 3000, reviewed: 1 },
        { date: 'b', seconds: 1000, reviewed: 1 },
      ]),
    ).toBe(4000);
    expect([0, 59, 720, 3600, 11_520].map(formatDuration)).toEqual(['0분', '0분', '12분', '1시간 0분', '3시간 12분']);
  });
});
