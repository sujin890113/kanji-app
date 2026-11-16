import { describe, expect, it } from 'vitest';
import { jaMatches, jamo, koMatches, matchingReadings, type SoundRule } from './soundRules';

const rule = (ko: string, ja: string): SoundRule => ({ id: 'r', title: '', ko_pattern: ko, ja_pattern: ja, description: '', examples: [] });

describe('jamo', () => {
  it('초성과 받침을 나눈다', () => {
    expect(jamo('첩')).toEqual(['ㅊ', 'ㅂ']);
    expect(jamo('국')).toEqual(['ㄱ', 'ㄱ']);
    expect(jamo('학')).toEqual(['ㅎ', 'ㄱ']);
    expect(jamo('나')).toEqual(['ㄴ', '']);
  });
  it('한글 음절 하나가 아니면 null', () => {
    expect(jamo('ㄱ')).toBeNull();
    expect(jamo('A')).toBeNull();
    expect(jamo('국어')).toBeNull();
  });
});

describe('패턴', () => {
  it('받침·초성', () => {
    expect(koMatches('받침:ㄱ', '국')).toBe(true);
    expect(koMatches('받침:ㄴ|ㅁ', '삼')).toBe(true);
    expect(koMatches('받침:ㄴ|ㅁ', '삽')).toBe(false);
    expect(koMatches('초성:ㅎ', '학')).toBe(true);
  });
  it('음독의 끝과 행 (탁음 행은 따로 적은 경우만)', () => {
    expect(jaMatches('끝:ク|キ', 'コク')).toBe(true);
    expect(jaMatches('끝:ウ|イ', 'セイ')).toBe(true);
    expect(jaMatches('끝:ウ|イ', 'シン')).toBe(false);
    expect(jaMatches('행:カ|ガ', 'ガク')).toBe(true);
    expect(jaMatches('행:カ', 'ガク')).toBe(false);
    expect(jaMatches('행:カ|ガ', '')).toBe(false);
  });
  it('규칙에 맞는 음독만 고른다 (貼 : 첩 → チョウ)', () => {
    expect(matchingReadings(rule('받침:ㅂ', '끝:ウ'), ['テン', 'チョウ'])).toEqual(['チョウ']);
    expect(matchingReadings(rule('받침:ㅇ', '끝:ウ|イ'), ['セイ', 'ショウ', 'シン'])).toEqual(['セイ', 'ショウ']);
  });
});
