/** 세션 공통 규칙 (SPEC 4.3) */

import type { Rating } from './types';

/** 자리 비움 보정 : 판정까지 걸린 시간은 60초에서 자른다. */
export const ELAPSED_CAP_MS = 60_000;

export function capElapsed(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(ms, ELAPSED_CAP_MS);
}

/** 기기 시간대 기준 날짜 키 (daily 테이블) */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 세션 카드 수 한도 (session_size 설정. 'chapter'면 제한 없음) */
export function sessionLimit(sessionSize: number | 'chapter'): number {
  return sessionSize === 'chapter' ? Number.POSITIVE_INFINITY : sessionSize;
}

export interface SessionCounts {
  study: number;
  vague: number;
  know: number;
}

/** 졸업(길게 누르기)은 '알고있음'으로 센다 */
export function addCount(counts: SessionCounts, rating: Rating): SessionCounts {
  const key: keyof SessionCounts = rating === 'study' ? 'study' : rating === 'vague' ? 'vague' : 'know';
  return { ...counts, [key]: counts[key] + 1 };
}

export const emptyCounts = (): SessionCounts => ({ study: 0, vague: 0, know: 0 });

/** 훈독 표기 : KANJIDIC2의 "は.る" → "は(る)" (SPEC 2.1 표) */
export function formatKun(kun: string): string {
  const [stem, okurigana] = kun.split('.');
  return okurigana ? `${stem}(${okurigana})` : stem;
}
