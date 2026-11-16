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

/** 같은 세션 안에서 다시 낼 때 몇 장 뒤에 낼지 (간격 반복의 공부하겠음) */
export const REQUEUE_GAP = 3;

/** 목록에서 id를 빼고 position 위치(0부터)에 다시 넣는다. 목록보다 뒤면 맨 끝 */
export function requeue(queue: readonly string[], id: string, position: number): string[] {
  const rest = queue.filter((q) => q !== id);
  const at = Math.max(0, Math.min(Math.floor(position), rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * 애매함을 다시 낼 위치 : 이번 세션에 남은 첫 출제 수만큼 뒤 (= 세션의 맨 뒤).
 * remainingFirst : 이번 세션에서 아직 처음 판정할 수 있는 카드 수 (Infinity면 목록 끝)
 */
export function vagueRequeuePosition(queueLengthWithoutId: number, remainingFirst: number): number {
  return Math.min(queueLengthWithoutId, Math.max(0, remainingFirst));
}

export const emptyCounts = (): SessionCounts => ({ study: 0, vague: 0, know: 0 });

/** 훈독 표기 : KANJIDIC2의 "は.る" → "は(る)" (SPEC 2.1 표) */
export function formatKun(kun: string): string {
  const [stem, okurigana] = kun.split('.');
  return okurigana ? `${stem}(${okurigana})` : stem;
}
