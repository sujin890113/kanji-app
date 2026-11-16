import { describe, expect, it } from 'vitest';
import { hunStems, normalizeKana, queryStems, searchKanji, toKatakana, type SearchItem } from './search';

const items: SearchItem[] = [
  { id: '国', on: ['コク'], kun: ['くに'], ko_main: { hun: '나라', eum: '국' }, ko_more: [] },
  { id: '貼', on: ['テン', 'チョウ'], kun: ['は.る', 'つ.く'], ko_main: { hun: '붙일', eum: '첩' }, ko_more: [{ hun: '붙을', eum: '첩' }] },
  { id: '張', on: ['チョウ'], kun: ['は.る', '-ば.り'], ko_main: { hun: '베풀', eum: '장' }, ko_more: [] },
  { id: '清', on: ['セイ', 'ショウ'], kun: ['きよ.い'], ko_main: { hun: '맑을', eum: '청' }, ko_more: [] },
  { id: '学', on: ['ガク'], kun: ['まな.ぶ'], ko_main: { hun: '배울', eum: '학' }, ko_more: [] },
  { id: '働', on: ['ドウ'], kun: ['はたら.く'], ko_main: null, ko_more: [] },
  { id: '𠮟', on: ['シツ'], kun: ['しか.る'], ko_main: { hun: '꾸짖을', eum: '질' }, ko_more: [] },
];
const aliases = { 叱: '𠮟', 國: '国', 學: '学' };
const ids = (q: string) => searchKanji(items, q, aliases).map((h) => h.id);

describe('가나 정규화', () => {
  it('히라가나를 가타카나로', () => {
    expect(toKatakana('はる')).toBe('ハル');
    expect(toKatakana('チョウ')).toBe('チョウ');
  });
  it('훈독의 점과 접사 표시를 지운다', () => {
    expect(normalizeKana('は.る')).toBe('ハル');
    expect(normalizeKana('-ば.り')).toBe('バリ');
  });
});

describe('훈 어간', () => {
  it('관형형 ㄹ받침과 을을 뗀다', () => {
    expect(hunStems('붙일')).toEqual(['붙일', '붙이']);
    expect(hunStems('배울')).toEqual(['배울', '배우']);
    expect(hunStems('맑을')).toEqual(['맑을', '맑으', '맑']);
    expect(hunStems('나라')).toEqual(['나라']);
  });
  it('입력 끝의 다를 뗀다', () => {
    expect(queryStems('붙이다')).toEqual(['붙이다', '붙이']);
    expect(queryStems('다')).toEqual(['다']);
  });
});

describe('searchKanji', () => {
  it('한국 음으로 찾는다', () => {
    expect(ids('첩')).toEqual(['貼']);
    expect(ids('국')).toEqual(['国']);
  });
  it('한국 훈(기본형)으로 찾는다', () => {
    expect(ids('붙이다')).toEqual(['貼']);
    expect(ids('맑다')).toEqual(['清']);
    expect(ids('배우다')).toEqual(['学']);
    expect(ids('나라')).toEqual(['国']);
  });
  it('훈과 음을 함께 입력하면 맨 앞에', () => {
    expect(searchKanji(items, '붙일 첩', aliases)[0]).toMatchObject({ id: '貼', via: 'hun' });
  });
  it('히라가나 훈독은 점을 무시하고 찾는다', () => {
    expect(ids('はる')).toEqual(['貼', '張']);
  });
  it('가타카나 음독, 히라가나로 입력한 음독도 찾는다', () => {
    expect(ids('チョウ')).toEqual(['貼', '張']);
    expect(ids('ちょう')).toEqual(['貼', '張']);
  });
  it('앞부분만 입력해도 찾되 완전 일치를 앞에 둔다', () => {
    const hits = searchKanji(items, 'はた', aliases);
    expect(hits.map((h) => h.id)).toEqual(['働']);
    expect(hits[0].rank).toBe(2);
  });
  it('한자 그대로, 다른 자형(대체 자형·정자체)으로 찾는다', () => {
    expect(ids('貼')).toEqual(['貼']);
    expect(ids('叱')).toEqual(['𠮟']);
    expect(ids('𠮟')).toEqual(['𠮟']);
    expect(ids('國')).toEqual(['国']);
    expect(searchKanji(items, '國', aliases)[0].via).toBe('alias');
  });
  it('한자 여러 글자는 글자마다 찾는다', () => {
    expect(ids('国学')).toEqual(['国', '学']);
  });
  it('빈 입력과 없는 말은 결과 없음', () => {
    expect(ids('  ')).toEqual([]);
    expect(ids('없는말')).toEqual([]);
    expect(ids('猫')).toEqual([]);
  });
  it('한국 음이 없는 일본 고유 한자도 읽기로는 찾는다', () => {
    expect(ids('はたらく')).toEqual(['働']);
    expect(ids('ドウ')).toEqual(['働']);
  });
});
