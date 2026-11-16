/** 홈(S1) 지표 계산 : 연속 학습일, 이번 주 복습 예정 (SPEC 6장 S1, F12) */

import { dateKey } from './session';
import { endOfDay } from './srs';
import type { CardState, Rating } from './types';

const DAY = 86_400_000;

/**
 * 연속 학습일 : 오늘(또는 오늘 아직 안 했으면 어제)부터 거꾸로, 판정한 날이 끊기지 않고 이어진 날 수.
 * days : 판정이 1건 이상 있는 날짜 키(YYYY-MM-DD)
 */
export function streakDays(days: Iterable<string>, now: number): number {
  const set = new Set(days);
  const start = new Date(now);
  start.setHours(12, 0, 0, 0); // 서머타임 경계에서도 하루씩 정확히 이동
  let t = start.getTime();
  if (!set.has(dateKey(t))) t -= DAY;
  let n = 0;
  while (set.has(dateKey(t))) {
    n += 1;
    t -= DAY;
  }
  return n;
}

/** 이번 주(월~일) 날짜별 복습 예정 카드 수. 오늘 칸에는 밀린 카드도 넣고, 지난 날은 0 */
export function weekForecast(cards: Iterable<CardState>, now: number): { date: string; count: number; isToday: boolean }[] {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const monday = today.getTime() - ((today.getDay() + 6) % 7) * DAY;
  const days = Array.from({ length: 7 }, (_, i) => dateKey(monday + i * DAY));
  const todayKey = dateKey(now);
  const counts = new Map(days.map((d) => [d, 0]));
  for (const c of cards) {
    if (c.status !== 'learning' && c.status !== 'review') continue;
    const key = c.due === null || c.due <= endOfDay(now) ? todayKey : dateKey(c.due);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return days.map((d) => ({ date: d, count: d < todayKey ? 0 : counts.get(d)!, isToday: d === todayKey }));
}

// ───────────── S6 격자 · S7 통계 (M6) ─────────────

/** 격자 칸 상태 (SPEC 5.3 역할 고정표) */
export type GridState = 'new' | 'learning' | 'vague' | 'know' | 'graduated';

export const GRID_STATES: readonly GridState[] = ['new', 'learning', 'vague', 'know', 'graduated'];

/** 판정 이력 한 줄 중 통계에 필요한 값 */
export interface LogLike {
  kanji_id: string;
  rating: Rating;
  ts: number;
}

/** 한자별 마지막 판정. logs는 기록 순서(오래된 것부터) */
export function lastRatings(logs: Iterable<LogLike>): Map<string, Rating> {
  const out = new Map<string, Rating>();
  for (const l of logs) out.set(l.kanji_id, l.rating);
  return out;
}

/**
 * 격자 칸 상태 : 미학습 / 학습 중 / 애매 / 알고있음 / 졸업.
 * '애매'는 학습 중(learning)이면서 마지막 판정이 애매함인 한자다.
 * '알고있음'은 '알고있음'을 1회 이상 받은 한자다 (장 완료 기준과 같음).
 */
export function gridState(card: CardState | undefined, last: Rating | undefined): GridState {
  if (!card || card.status === 'new') return 'new';
  if (card.status === 'graduated') return 'graduated';
  if (card.status === 'review' || card.pass_count > 0) return 'know';
  return last === 'vague' ? 'vague' : 'learning';
}

export type StateCounts = Record<GridState, number>;

export const emptyStateCounts = (): StateCounts => ({ new: 0, learning: 0, vague: 0, know: 0, graduated: 0 });

/** 한자 목록의 상태별 수 (급수별 진도 막대) */
export function countStates(ids: readonly string[], stateOf: (id: string) => GridState): StateCounts {
  const out = emptyStateCounts();
  for (const id of ids) out[stateOf(id)] += 1;
  return out;
}

/** 일별 기록 중 통계에 필요한 값 */
export interface DailyLike {
  date: string;
  seconds: number;
  reviewed: number;
}

/** 오늘을 포함한 최근 n일의 날짜 키 (오래된 날부터) */
export function recentDates(now: number, n: number): string[] {
  const t = new Date(now);
  t.setHours(12, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => dateKey(t.getTime() - (n - 1 - i) * DAY));
}

export interface CalendarDay {
  date: string;
  count: number;
  /** 색 농도 0~4 (0 : 학습 없음) */
  level: 0 | 1 | 2 | 3 | 4;
  /** 오늘 뒤의 날 (빈칸) */
  future: boolean;
}

/** 하루 목표 대비 농도 : 없음 / 목표의 절반 미만 / 목표 미만 / 목표의 1.5배 미만 / 그 이상 */
export function intensity(count: number, goal: number): CalendarDay['level'] {
  if (count <= 0) return 0;
  const g = Math.max(1, goal);
  if (count < g / 2) return 1;
  if (count < g) return 2;
  if (count < g * 1.5) return 3;
  return 4;
}

/** 최근 weeks주 달력. 주 배열이고, 각 주는 월~일 7칸, 마지막 주가 이번 주다 */
export function calendarWeeks(daily: Iterable<DailyLike>, now: number, goal: number, weeks = 12): CalendarDay[][] {
  const byDate = new Map<string, number>();
  for (const d of daily) byDate.set(d.date, d.reviewed);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const monday = today.getTime() - ((today.getDay() + 6) % 7) * DAY;
  const start = monday - (weeks - 1) * 7 * DAY;
  const todayKey = dateKey(now);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = dateKey(start + (w * 7 + d) * DAY);
      const future = date > todayKey;
      const count = future ? 0 : (byDate.get(date) ?? 0);
      return { date, count, level: intensity(count, goal), future };
    }),
  );
}

export interface DayRatings {
  date: string;
  study: number;
  vague: number;
  /** 알고있음 + 졸업 */
  know: number;
}

/** 최근 n일의 날짜별 판정 수 (일별 추이) */
export function dailyRatings(logs: Iterable<LogLike>, now: number, n = 30): DayRatings[] {
  const days = recentDates(now, n);
  const map = new Map(days.map((date) => [date, { date, study: 0, vague: 0, know: 0 }]));
  for (const l of logs) {
    const row = map.get(dateKey(l.ts));
    if (!row) continue;
    if (l.rating === 'study') row.study += 1;
    else if (l.rating === 'vague') row.vague += 1;
    else row.know += 1;
  }
  return days.map((d) => map.get(d)!);
}

/** 전체 판정 수 (공부하겠음 / 애매함 / 알고있음+졸업) */
export function ratingShares(logs: Iterable<LogLike>): { study: number; vague: number; know: number; total: number } {
  let study = 0;
  let vague = 0;
  let know = 0;
  for (const l of logs) {
    if (l.rating === 'study') study += 1;
    else if (l.rating === 'vague') vague += 1;
    else know += 1;
  }
  return { study, vague, know, total: study + vague + know };
}

/**
 * 자주 틀리는 한자 : '공부하겠음' 횟수(study_marks) 상위 n자. 0회는 넣지 않는다.
 * 같은 횟수면 order(급수·순번 순서)가 앞인 한자부터.
 */
export function topStudied(
  cards: Iterable<CardState>,
  order: ReadonlyMap<string, number>,
  n = 30,
): { id: string; marks: number }[] {
  const big = Number.MAX_SAFE_INTEGER;
  return [...cards]
    .filter((c) => c.study_marks > 0)
    .sort((a, b) => b.study_marks - a.study_marks || (order.get(a.kanji_id) ?? big) - (order.get(b.kanji_id) ?? big))
    .slice(0, n)
    .map((c) => ({ id: c.kanji_id, marks: c.study_marks }));
}

/** 누적 학습 시간(초) */
export function totalSeconds(daily: Iterable<DailyLike>): number {
  let s = 0;
  for (const d of daily) s += d.seconds;
  return s;
}

/** 초 → '3시간 12분', '12분', '0분' */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`;
}
