/**
 * 발음 음성에 넘길 글 (F11). 음성 합성 자체는 화면 쪽(src/audio)이 한다.
 * - 음독 : 가타카나 그대로 (チョウ)
 * - 훈독 : 오쿠리가나 점과 접사 표시(-)를 지운 히라가나 (は.る → はる, -こ.む → こむ)
 */

export function kunSpeech(kun: string): string {
  return kun.replace(/[.\-]/g, '');
}

/** 음독·훈독을 차례로 읽을 글 목록. 같은 소리가 겹치면 한 번만 */
export function readingSpeech(on: readonly string[], kun: readonly string[]): string[] {
  return [...new Set([...on, ...kun.map(kunSpeech)].filter(Boolean))];
}

export type StrokeSpeed = 'slow' | 'normal' | 'fast';

/** 길이 1(viewBox 단위)을 그리는 데 걸리는 시간(ms)과 획 사이 쉼 */
const MS_PER_UNIT: Record<StrokeSpeed, number> = { slow: 22, normal: 12, fast: 6 };
const GAP: Record<StrokeSpeed, number> = { slow: 350, normal: 200, fast: 100 };
const MIN_MS = 120;

export interface StrokeStep {
  delay: number;
  duration: number;
}

/**
 * 획순 애니메이션 시간표 (F10). 획 길이에 비례해 그리고, 획 사이에 짧게 쉰다.
 * 반환 : 획마다 시작 시각과 걸리는 시간, 전체 길이
 */
export function strokeTimeline(lengths: readonly number[], speed: StrokeSpeed): { steps: StrokeStep[]; total: number } {
  let t = 0;
  const steps = lengths.map((len, i) => {
    const duration = Math.max(MIN_MS, Math.round(len * MS_PER_UNIT[speed]));
    const step = { delay: t, duration };
    t += duration + (i < lengths.length - 1 ? GAP[speed] : 0);
    return step;
  });
  return { steps, total: t };
}
