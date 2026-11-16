/**
 * 회독 방식 (SPEC 4.1, F5 끔)
 *
 * | 판정 | 카드 상태 | 회독 |
 * | 공부하겠음 | learning | 이번 회독에서 빠지고 다음 회독에 다시 나옴 |
 * | 알고있음 | review | 다음 회독부터 제외 |
 * | 길게 누르기 | graduated | 어디서도 더 출제하지 않음 |
 *
 * 한 장의 남은 한자(new·learning)를 끝까지 돌면 회독 수가 1 오르고,
 * 남은 한자만으로 다음 회독을 시작한다. 남은 한자가 0이면 장 완료.
 */

import type { CardOrder, CardState, ChapterProgress, Direction, Rating, Rng } from './types';

export function newCard(kanji_id: string, direction: Direction = 'forward'): CardState {
  return {
    kanji_id,
    direction,
    status: 'new',
    due: null,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    last_review: null,
    pass_count: 0,
    study_marks: 0,
    favorite: false,
  };
}

/** 회독에 아직 남아 있는 카드인가 (카드 기록이 없으면 새 한자) */
export function isRemaining(card: CardState | undefined): boolean {
  return !card || card.status === 'new' || card.status === 'learning';
}

/** 판정을 카드 상태에 반영한다 (회독 방식). */
export function gradeCard(card: CardState, rating: Rating, now: number): CardState {
  const base = { ...card, reps: card.reps + 1, last_review: now };
  switch (rating) {
    case 'study':
      return { ...base, status: 'learning', study_marks: card.study_marks + 1 };
    case 'vague':
      return { ...base, status: 'learning' };
    case 'know':
      return { ...base, status: 'review', pass_count: card.pass_count + 1 };
    case 'graduate':
      return { ...base, status: 'graduated' };
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 장의 남은 한자로 회독 출제 순서를 만든다. ids는 장 안 순번 순서. */
export function buildRoundQueue(
  ids: readonly string[],
  cards: ReadonlyMap<string, CardState>,
  order: CardOrder,
  rng: Rng,
): string[] {
  const remaining = ids.filter((id) => isRemaining(cards.get(id)));
  return order === 'shuffle' ? shuffle(remaining, rng) : remaining;
}

/** 처음 여는 장의 진행 상태 */
export function initProgress(
  level: number,
  chapter: number,
  ids: readonly string[],
  cards: ReadonlyMap<string, CardState>,
  order: CardOrder,
  rng: Rng,
  now: number,
): ChapterProgress {
  const queue = buildRoundQueue(ids, cards, order, rng);
  return {
    level,
    chapter,
    pass_count: 0,
    completed_at: queue.length === 0 ? now : null,
    round_queue: queue,
    round_size: queue.length,
  };
}

export interface SettleResult {
  progress: ChapterProgress;
  /** 이번 정리에서 회독 하나가 끝났는가 */
  roundCompleted: boolean;
  /** 이번 정리에서 장이 완료됐는가 */
  chapterCompleted: boolean;
}

/**
 * 진행 상태를 카드 상태에 맞춰 정리한다.
 * - 회독 목록에서 이미 알고있음·졸업이 된 한자를 뺀다 (다른 화면에서 판정이 바뀐 경우 등)
 * - 목록이 비면 회독 수를 올리고 다음 회독을 시작하거나 장을 완료한다
 */
export function settleProgress(
  progress: ChapterProgress,
  ids: readonly string[],
  cards: ReadonlyMap<string, CardState>,
  order: CardOrder,
  rng: Rng,
  now: number,
): SettleResult {
  if (progress.completed_at !== null) {
    return { progress, roundCompleted: false, chapterCompleted: false };
  }
  const inChapter = new Set(ids);
  const queue = progress.round_queue.filter((id) => inChapter.has(id) && isRemaining(cards.get(id)));
  if (queue.length > 0) {
    return { progress: { ...progress, round_queue: queue }, roundCompleted: false, chapterCompleted: false };
  }

  const next = buildRoundQueue(ids, cards, order, rng);
  const pass_count = progress.pass_count + 1;
  if (next.length === 0) {
    return {
      progress: { ...progress, pass_count, completed_at: now, round_queue: [], round_size: 0 },
      roundCompleted: true,
      chapterCompleted: true,
    };
  }
  return {
    progress: { ...progress, pass_count, round_queue: next, round_size: next.length },
    roundCompleted: true,
    chapterCompleted: false,
  };
}

/** 회독 중 한 한자를 판정한 뒤의 진행 상태 */
export function advanceRound(
  progress: ChapterProgress,
  gradedId: string,
  ids: readonly string[],
  cardsAfter: ReadonlyMap<string, CardState>,
  order: CardOrder,
  rng: Rng,
  now: number,
): SettleResult {
  const removed = { ...progress, round_queue: progress.round_queue.filter((id) => id !== gradedId) };
  return settleProgress(removed, ids, cardsAfter, order, rng, now);
}

/** 화면에 보여줄 회독 번호 (1회독부터). 완료한 장은 마지막으로 끝낸 회독 */
export function roundNumber(progress: ChapterProgress): number {
  return progress.completed_at !== null ? Math.max(progress.pass_count, 1) : progress.pass_count + 1;
}

/** 현재 회독에서 판정한 한자 수 */
export function roundDone(progress: ChapterProgress): number {
  return progress.round_size - progress.round_queue.length;
}

/** "처음부터 다시" : 장의 카드를 새 한자로 되돌린다 (즐겨찾기는 유지). */
export function resetCard(card: CardState): CardState {
  return { ...newCard(card.kanji_id, card.direction), favorite: card.favorite };
}
