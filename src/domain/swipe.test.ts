import { describe, expect, it } from 'vitest';
import { dragRotation, swipeDirection, swipeProgress, swipeRating } from './swipe';

const three = { threeGrade: true, threshold: 100 };
const two = { threeGrade: false, threshold: 100 };

describe('스와이프 방향', () => {
  it('왼쪽 공부하겠음, 오른쪽 알고있음, 위 애매함', () => {
    expect(swipeDirection(-50, 10, true)).toBe('study');
    expect(swipeDirection(50, -10, true)).toBe('know');
    expect(swipeDirection(10, -50, true)).toBe('vague');
  });
  it('F6이 꺼지면 위쪽이 없고, 아래쪽은 언제나 없다', () => {
    expect(swipeDirection(10, -50, false)).toBeNull();
    expect(swipeDirection(10, 50, true)).toBeNull();
    expect(swipeDirection(0, 0, true)).toBeNull();
  });
});

describe('손을 뗐을 때', () => {
  it('거리를 넘으면 판정', () => {
    expect(swipeRating(120, 0, three)).toBe('know');
    expect(swipeRating(-100, 20, three)).toBe('study');
    expect(swipeRating(0, -130, three)).toBe('vague');
    expect(swipeRating(0, -130, two)).toBeNull();
  });
  it('모자라면 판정하지 않지만, 빠르게 튕기면 절반 거리로도 판정', () => {
    expect(swipeRating(80, 0, three)).toBeNull();
    expect(swipeRating(60, 0, three, 0.8)).toBe('know');
    expect(swipeRating(40, 0, three, 0.8)).toBeNull();
  });
  it('진하기 0~1', () => {
    expect(swipeProgress(50, 0, three)).toBe(0.5);
    expect(swipeProgress(-300, 0, three)).toBe(1);
    expect(swipeProgress(0, 50, three)).toBe(0);
  });
  it('기울기는 ±12도 안', () => {
    expect(dragRotation(100, 375)).toBeCloseTo(4, 0);
    expect(dragRotation(1000, 375)).toBe(12);
    expect(dragRotation(-1000, 375)).toBe(-12);
    expect(dragRotation(10, 0)).toBe(0);
  });
});
