import { useMemo } from 'react';
import type { Content } from '../content/content';
import { summarizeChapters, type ChapterSummary } from '../domain/progress';
import type { CardState, ChapterProgress } from '../domain/types';
import { useSettings } from '../settings/useSettings';
import { getAllCards, getAllChapters } from './study';
import { useLive } from './useLive';

export interface ProgressView {
  rows: ChapterProgress[];
  cards: Map<string, CardState>;
  summary: ChapterSummary;
}

/** 장 진행 기록과 한자별 학습 상태로 장 완료·열림·현재 장을 계산해 구독한다. 불러오는 동안 undefined */
export function useProgressView(content: Content): ProgressView | undefined {
  const [settings] = useSettings();
  const rows = useLive(getAllChapters);
  const cards = useLive(getAllCards);
  return useMemo(() => {
    if (!rows || !cards) return undefined;
    return { rows, cards, summary: summarizeChapters(content.chapters, content.outline, rows, cards, settings.level_lock) };
  }, [rows, cards, content, settings.level_lock]);
}
