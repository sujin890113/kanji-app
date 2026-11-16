import { describe, expect, it } from 'vitest';
import { kunSpeech, readingSpeech, strokeTimeline } from './speech';

describe('읽을 글', () => {
  it('훈독은 점과 접사 표시를 지운다', () => {
    expect(kunSpeech('は.る')).toBe('はる');
    expect(kunSpeech('-こ.む')).toBe('こむ');
    expect(kunSpeech('くに')).toBe('くに');
  });
  it('음독 → 훈독 순서, 겹치는 소리는 한 번', () => {
    expect(readingSpeech(['テン', 'チョウ'], ['は.る', 'つ.く'])).toEqual(['テン', 'チョウ', 'はる', 'つく']);
    expect(readingSpeech([], ['こ.む', '-こ.む'])).toEqual(['こむ']);
  });
});

describe('strokeTimeline', () => {
  it('획 길이에 비례하고 획 사이에 쉰다', () => {
    const { steps, total } = strokeTimeline([50, 100], 'normal');
    expect(steps).toEqual([
      { delay: 0, duration: 600 },
      { delay: 800, duration: 1200 },
    ]);
    expect(total).toBe(2000);
  });
  it('짧은 획도 최소 시간은 걸린다', () => {
    expect(strokeTimeline([1], 'fast').steps[0].duration).toBe(120);
  });
  it('느림 > 보통 > 빠름', () => {
    const t = (s: 'slow' | 'normal' | 'fast') => strokeTimeline([40, 40, 40], s).total;
    expect(t('slow')).toBeGreaterThan(t('normal'));
    expect(t('normal')).toBeGreaterThan(t('fast'));
  });
  it('획이 없으면 0', () => {
    expect(strokeTimeline([], 'normal')).toEqual({ steps: [], total: 0 });
  });
});
