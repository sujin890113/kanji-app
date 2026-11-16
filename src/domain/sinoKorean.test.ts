import { describe, expect, it } from 'vitest';
import { applyDueum, sinoKorean } from './sinoKorean';

const EUM: Record<string, string> = {
  女: '녀', 子: '자', 旅: '려', 行: '행', 労: '로', 働: '', 来: '래', 年: '년', 料: '료', 理: '리',
  学: '학', 生: '생', 論: '론', 流: '류', 冷: '랭', 例: '례', 両: '량', 人: '인', 男: '남',
};
const ko = (t: string) => sinoKorean(t, (c) => EUM[c]);

describe('applyDueum', () => {
  it('ㄹ + ㅑㅕㅖㅛㅠㅣ → ㅇ', () => {
    expect(applyDueum('려')).toBe('여');
    expect(applyDueum('료')).toBe('요');
    expect(applyDueum('류')).toBe('유');
    expect(applyDueum('리')).toBe('이');
    expect(applyDueum('례')).toBe('예');
    expect(applyDueum('량')).toBe('양');
  });
  it('ㄹ + 그 밖의 모음 → ㄴ', () => {
    expect(applyDueum('로')).toBe('노');
    expect(applyDueum('래')).toBe('내');
    expect(applyDueum('론')).toBe('논');
    expect(applyDueum('랭')).toBe('냉');
  });
  it('ㄴ + ㅕㅛㅠㅣ → ㅇ, 그 밖은 그대로', () => {
    expect(applyDueum('녀')).toBe('여');
    expect(applyDueum('년')).toBe('연');
    expect(applyDueum('남')).toBe('남');
    expect(applyDueum('학')).toBe('학');
  });
  it('한글 음절이 아니면 그대로', () => {
    expect(applyDueum('A')).toBe('A');
  });
});

describe('sinoKorean', () => {
  it('첫 글자에만 두음법칙', () => {
    expect(ko('女子')).toBe('여자');
    expect(ko('旅行')).toBe('여행');
    expect(ko('料理')).toBe('요리');
    expect(ko('来年')).toBe('내년');
    expect(ko('年')).toBe('연');
    expect(ko('男女')).toBe('남녀');
    expect(ko('論理')).toBe('논리');
    expect(ko('流行')).toBe('유행');
  });
  it('두음법칙과 상관없는 단어', () => {
    expect(ko('学生')).toBe('학생');
  });
  it('가나가 섞이거나 한국 음이 없으면 null', () => {
    expect(ko('学ぶ')).toBeNull();
    expect(ko('労働')).toBeNull();
    expect(ko('')).toBeNull();
  });
  it('々는 앞 글자의 음을 되풀이', () => {
    expect(ko('人々')).toBe('인인');
    expect(ko('々')).toBeNull();
  });
});
