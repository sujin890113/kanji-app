/** 홈(S1) 지표 계산 : 연속 학습일, 이번 주 복습 예정 (SPEC 6장 S1, F12) */

import { dateKey } from './session';
import { endOfDay } from './srs';
import type { CardState } from './types';

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
