import { useMemo } from 'react';
import { gridState, lastRatings, type GridState } from '../domain/stats';
import type { CardState, Rating } from '../domain/types';
import type { DailyRow, ReviewLogRow } from './database';
import { getAllCards, getAllDaily, getForwardLogs } from './study';
import { useLive } from './useLive';

export interface StudyRecords {
  cards: Map<string, CardState>;
  logs: ReviewLogRow[];
  daily: DailyRow[];
  last: Map<string, Rating>;
  /** 한자의 격자 칸 상태 (정방향 기준) */
  stateOf: (id: string) => GridState;
}

/** 격자(S6)·통계(S7)용 학습 기록 구독. 불러오는 동안 undefined */
export function useStudyRecords(): StudyRecords | undefined {
  const cards = useLive(getAllCards);
  const logs = useLive(getForwardLogs);
  const daily = useLive(getAllDaily);
  return useMemo(() => {
    if (!cards || !logs || !daily) return undefined;
    const last = lastRatings(logs);
    return { cards, logs, daily, last, stateOf: (id: string) => gridState(cards.get(id), last.get(id)) };
  }, [cards, logs, daily]);
}
