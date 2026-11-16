import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  buildRoundQueue,
  gradeCard,
  initProgress,
  isRemaining,
  newCard,
  resetCard,
  roundDone,
  roundNumber,
  settleProgress,
  shuffle,
} from './scheduler';
import type { CardState, Rating } from './types';

const IDS = ['一', '二', '三', '四'];
const fixedRng = () => 0; // 섞기 결과를 고정

function cardsOf(entries: [string, CardState][] = []) {
  return new Map(entries);
}

/** 한 회독을 판정 목록대로 돌린다. 판정이 없으면 'know' */
function playRound(
  progress: ReturnType<typeof initProgress>,
  cards: Map<string, CardState>,
  ratings: Record<string, Rating>,
  now = 1000,
) {
  let p = progress;
  let result = { progress: p, roundCompleted: false, chapterCompleted: false };
  const queue = [...p.round_queue];
  for (const id of queue) {
    const card = cards.get(id) ?? newCard(id);
    cards.set(id, gradeCard(card, ratings[id] ?? 'know', now));
    result = advanceRound(p, id, IDS, cards, 'sequential', fixedRng, now);
    p = result.progress;
  }
  return result;
}

describe('gradeCard (회독 방식 판정)', () => {
  it('공부하겠음 : learning, 공부 표시 1 증가', () => {
    const c = gradeCard(newCard('一'), 'study', 5);
    expect(c.status).toBe('learning');
    expect(c.study_marks).toBe(1);
    expect(c.reps).toBe(1);
    expect(c.last_review).toBe(5);
  });

  it('알고있음 : review (졸업이 아님), 통과 1 증가', () => {
    const c = gradeCard(newCard('一'), 'know', 5);
    expect(c.status).toBe('review');
    expect(c.pass_count).toBe(1);
  });

  it('길게 누르기 : graduated', () => {
    expect(gradeCard(newCard('一'), 'graduate', 5).status).toBe('graduated');
  });

  it('남은 한자 판정 : new·learning·기록 없음만 남는다', () => {
    expect(isRemaining(undefined)).toBe(true);
    expect(isRemaining(newCard('一'))).toBe(true);
    expect(isRemaining(gradeCard(newCard('一'), 'study', 1))).toBe(true);
    expect(isRemaining(gradeCard(newCard('一'), 'know', 1))).toBe(false);
    expect(isRemaining(gradeCard(newCard('一'), 'graduate', 1))).toBe(false);
  });

  it('처음부터 다시 : 즐겨찾기만 남기고 새 한자로', () => {
    const c = { ...gradeCard(newCard('一'), 'know', 1), favorite: true };
    expect(resetCard(c)).toEqual({ ...newCard('一'), favorite: true });
  });
});

describe('회독 진행', () => {
  it('처음 연 장은 1회독, 남은 한자 전부로 시작', () => {
    const p = initProgress(5, 1, IDS, cardsOf(), 'sequential', fixedRng, 0);
    expect(p.round_queue).toEqual(IDS);
    expect(p.round_size).toBe(4);
    expect(roundNumber(p)).toBe(1);
    expect(roundDone(p)).toBe(0);
  });

  it('순번대로 출제하면 장 안 순서 그대로, 섞으면 같은 한자의 다른 순서', () => {
    expect(buildRoundQueue(IDS, cardsOf(), 'sequential', fixedRng)).toEqual(IDS);
    const shuffled = buildRoundQueue(IDS, cardsOf(), 'shuffle', () => 0.5);
    expect([...shuffled].sort()).toEqual([...IDS].sort());
  });

  it('섞기는 원본을 바꾸지 않는다', () => {
    const src = [1, 2, 3];
    shuffle(src, () => 0);
    expect(src).toEqual([1, 2, 3]);
  });

  it('공부하겠음 한자만 다음 회독에 남고, 회독 수가 오른다', () => {
    const cards = cardsOf();
    const p = initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 0);
    const r = playRound(p, cards, { 二: 'study', 四: 'study' });
    expect(r.roundCompleted).toBe(true);
    expect(r.chapterCompleted).toBe(false);
    expect(r.progress.pass_count).toBe(1);
    expect(r.progress.round_queue).toEqual(['二', '四']);
    expect(r.progress.round_size).toBe(2);
    expect(roundNumber(r.progress)).toBe(2);
  });

  it('회독 도중에는 남은 한자만 큐에 있다 (이어하기 기준)', () => {
    const cards = cardsOf();
    let p = initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 0);
    cards.set('一', gradeCard(newCard('一'), 'study', 1));
    p = advanceRound(p, '一', IDS, cards, 'sequential', fixedRng, 1).progress;
    cards.set('二', gradeCard(newCard('二'), 'know', 2));
    p = advanceRound(p, '二', IDS, cards, 'sequential', fixedRng, 2).progress;
    expect(p.round_queue).toEqual(['三', '四']);
    expect(roundDone(p)).toBe(2);
    expect(roundNumber(p)).toBe(1);
  });

  it('여러 회독 끝에 남은 한자가 0이면 장 완료', () => {
    const cards = cardsOf();
    let r = playRound(initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 0), cards, { 三: 'study' });
    expect(r.progress.round_queue).toEqual(['三']);
    r = playRound(r.progress, cards, { 三: 'study' });
    expect(r.progress.pass_count).toBe(2);
    r = playRound(r.progress, cards, {}, 999);
    expect(r.chapterCompleted).toBe(true);
    expect(r.progress.pass_count).toBe(3);
    expect(r.progress.completed_at).toBe(999);
    expect(r.progress.round_queue).toEqual([]);
    expect(roundNumber(r.progress)).toBe(3);
  });

  it('졸업(길게 누르기)한 한자도 남은 한자에서 빠진다', () => {
    const cards = cardsOf();
    const r = playRound(initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 0), cards, { 一: 'graduate', 二: 'study' });
    expect(r.progress.round_queue).toEqual(['二']);
  });

  it('정리 : 다른 곳에서 알고있음이 된 한자는 큐에서 빠진다', () => {
    const cards = cardsOf();
    const p = initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 0);
    cards.set('三', gradeCard(newCard('三'), 'know', 1));
    const r = settleProgress(p, IDS, cards, 'sequential', fixedRng, 1);
    expect(r.progress.round_queue).toEqual(['一', '二', '四']);
    expect(r.roundCompleted).toBe(false);
  });

  it('정리 : 완료한 장은 그대로 둔다', () => {
    const done = { ...initProgress(5, 1, IDS, cardsOf(), 'sequential', fixedRng, 0), completed_at: 5, round_queue: [] };
    expect(settleProgress(done, IDS, cardsOf(), 'sequential', fixedRng, 9).progress).toBe(done);
  });

  it('모든 한자를 이미 아는 장은 열자마자 완료', () => {
    const cards = cardsOf(IDS.map((id) => [id, gradeCard(newCard(id), 'know', 1)] as [string, CardState]));
    const p = initProgress(5, 1, IDS, cards, 'sequential', fixedRng, 7);
    expect(p.completed_at).toBe(7);
  });
});
