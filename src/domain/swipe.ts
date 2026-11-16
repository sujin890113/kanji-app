/**
 * 스와이프 판정 (SPEC S3 조작표) : 왼쪽 공부하겠음, 위 애매함(F6 켬), 오른쪽 알고있음.
 * 화면 코드에 의존하지 않는다. 거리 단위는 픽셀.
 */

import type { Rating } from './types';

export type SwipeRating = Exclude<Rating, 'graduate'>;

export interface SwipeOptions {
  /** F6 3단계 자기평가. 꺼져 있으면 위쪽 스와이프가 없다 */
  threeGrade: boolean;
  /** 판정으로 인정하는 거리 */
  threshold: number;
}

/** 끄는 방향이 가리키는 판정 (거리와 상관없이). 위쪽은 F6이 꺼져 있으면 없음, 아래쪽은 없음 */
export function swipeDirection(dx: number, dy: number, threeGrade: boolean): SwipeRating | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'know' : 'study';
  if (dy < 0 && threeGrade) return 'vague';
  return null;
}

/** 판정까지 얼마나 왔는가 (0~1). 가장자리 색과 라벨의 진하기 */
export function swipeProgress(dx: number, dy: number, opts: SwipeOptions): number {
  const dir = swipeDirection(dx, dy, opts.threeGrade);
  if (!dir) return 0;
  const dist = dir === 'vague' ? -dy : Math.abs(dx);
  return Math.max(0, Math.min(1, dist / opts.threshold));
}

/**
 * 손을 뗐을 때의 판정. 거리가 threshold를 넘거나, 빠르게 튕긴 경우(속도 0.5px/ms 이상이고 거리의 절반 이상) 판정한다.
 * velocity : 손을 떼기 직전의 속도 (px/ms, 끄는 방향 성분)
 */
export function swipeRating(dx: number, dy: number, opts: SwipeOptions, velocity = 0): SwipeRating | null {
  const dir = swipeDirection(dx, dy, opts.threeGrade);
  if (!dir) return null;
  const dist = dir === 'vague' ? -dy : Math.abs(dx);
  if (dist >= opts.threshold) return dir;
  if (velocity >= 0.5 && dist >= opts.threshold / 2) return dir;
  return null;
}

/** 끄는 동안의 기울기(도). 오른쪽으로 끌면 시계 방향 */
export function dragRotation(dx: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(-12, Math.min(12, (dx / width) * 15));
}
