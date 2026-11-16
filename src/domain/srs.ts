/**
 * 간격 반복 방식 (SPEC 4.2, F5 켬). 간격 계산은 ts-fsrs에 맡긴다.
 *
 * | 판정 | ts-fsrs 등급 | 동작 |
 * | 공부하겠음 | Again | 같은 세션 안에서 다시 나온 뒤 짧은 간격으로 편성 |
 * | 애매함 (F6) | Hard | 간격이 조금만 늘어남. 같은 세션 안에서 한 번 더 나옴 |
 * | 알고있음 | Good | 그날 다시 나오지 않고 바로 일 단위 간격 (새 카드·다시 배우는 카드도) |
 * | 길게 누르기 | 사용 안 함 | graduated, 출제 대상에서 제외 |
 *
 * 카드의 status(new/learning/review/graduated)는 회독 방식과 같은 규칙으로 판정에서 정한다.
 * FSRS 자체 상태는 fsrs_state에 따로 두어, F5를 껐다 켜도 단계 지도 색과 기록이 이어진다.
 */

import { createEmptyCard, fsrs, Rating as FsrsRating, type Card, type FSRS, type Grade } from 'ts-fsrs';
import { chapterDoneByCards } from './progress';
import { gradeCard, shuffle } from './scheduler';
import type { CardOrder, CardState, ChapterProgress, FsrsState, Rating, Rng } from './types';

export interface SrsOptions {
  /** 목표 기억률 (srs_retention) */
  retention: number;
  /** 간격에 약간의 무작위를 섞는다 (앱 켬, 테스트 끔) */
  fuzz: boolean;
}

const GRADE: Record<Exclude<Rating, 'graduate'>, Grade> = {
  study: FsrsRating.Again,
  vague: FsrsRating.Hard,
  know: FsrsRating.Good,
};

/**
 * 학습 단계(learning_steps)를 1분 하나만 둔다. ts-fsrs 기본값은 ['1m', '10m'].
 * - 알고있음(Good)은 학습 단계를 다 마친 것으로 처리되어 New·Learning에서 바로 Review(일 단위)로 간다.
 *   기본값이면 새 카드의 Good이 10분 단계로 가서 그날 다시 나온다.
 * - 공부하겠음(Again)은 1분 단계로 돌아가 그날 안에 다시 나온다 (기존과 같음).
 * - 애매함(Hard)은 단계가 하나일 때 1분 × 1.5 = 1.5분으로 그날 안에 다시 나온다 (기본값은 5.5분).
 * - 복습 카드의 공부하겠음은 relearning_steps 기본값 ['10m']으로 그날 다시 나오고, 그 뒤 알고있음이면 일 단위로 간다.
 * 같은 세션 안에서 다시 내는 것은 화면(세션 목록)이 따로 처리한다 (공부하겠음 3장 뒤, 애매함 세션 맨 뒤).
 */
export const LEARNING_STEPS = ['1m'] as const;

const schedulers = new Map<string, FSRS>();
function scheduler(opts: SrsOptions): FSRS {
  const key = `${opts.retention}:${opts.fuzz}`;
  let f = schedulers.get(key);
  if (!f) {
    f = fsrs({ request_retention: opts.retention, enable_fuzz: opts.fuzz, learning_steps: [...LEARNING_STEPS] });
    schedulers.set(key, f);
  }
  return f;
}

/** 저장된 카드를 ts-fsrs 카드로. FSRS로 한 번도 판정하지 않은 카드(회독 방식 기록 포함)는 새 카드로 본다 */
function toFsrs(card: CardState, now: number): Card {
  if (card.fsrs_state === 0 || card.due === null) return createEmptyCard(new Date(now));
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.fsrs_state,
    last_review: card.last_review === null ? undefined : new Date(card.last_review),
  };
}

/** 간격 반복 방식의 판정 */
export function gradeSrs(card: CardState, rating: Rating, now: number, opts: SrsOptions): CardState {
  const base = gradeCard(card, rating, now);
  if (rating === 'graduate') return base;
  const next = scheduler(opts).next(toFsrs(card, now), new Date(now), GRADE[rating]).card;
  return {
    ...base,
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    scheduled_days: next.scheduled_days,
    learning_steps: next.learning_steps,
    lapses: next.lapses,
    fsrs_state: next.state as FsrsState,
  };
}

/** 기기 시간대 기준 그날의 마지막 순간 */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 오늘 복습할 카드인가 : 판정한 적이 있고(learning·review), 출제일이 오늘 안이다.
 * 회독 방식에서 판정해 출제일이 없는 카드는 바로 복습 대상으로 본다 (F5를 켠 직후).
 */
export function isDue(card: CardState, now: number): boolean {
  if (card.status !== 'learning' && card.status !== 'review') return false;
  return card.due === null || card.due <= endOfDay(now);
}

/** 출제일 순(출제일 없음이 먼저) */
function byDue(a: CardState, b: CardState): number {
  return (a.due ?? Number.NEGATIVE_INFINITY) - (b.due ?? Number.NEGATIVE_INFINITY);
}

export interface SrsQueueInput {
  /** 복습 후보 카드 (오늘 학습 : 전체, 장 학습 : 그 장) */
  pool: readonly CardState[];
  /** 새 한자 후보. 장 순서·장 안 순번 순서 */
  newCandidates: readonly string[];
  cards: ReadonlyMap<string, CardState>;
  now: number;
  /** 오늘 더 낼 수 있는 복습 수 / 새 한자 수 */
  reviewRoom: number;
  newRoom: number;
  /** 한 세션의 카드 수 */
  size: number;
  order: CardOrder;
  rng: Rng;
}

export interface SrsQueue {
  queue: string[];
  reviews: number;
  news: number;
}

/** 세션 구성 : (1) 오늘 출제일이 된 복습 카드, (2) 새 한자. 각 묶음 안의 순서는 card_order를 따른다 */
export function buildSrsQueue(input: SrsQueueInput): SrsQueue {
  const { now, size, order, rng } = input;
  const due = input.pool.filter((c) => isDue(c, now)).sort(byDue);
  const reviews = due.slice(0, Math.max(0, Math.min(input.reviewRoom, size))).map((c) => c.kanji_id);
  const newIds = input.newCandidates
    .filter((id) => {
      const c = input.cards.get(id);
      return !c || c.status === 'new';
    })
    .slice(0, Math.max(0, Math.min(input.newRoom, size - reviews.length)));
  const arrange = (ids: string[]) => (order === 'shuffle' ? shuffle(ids, rng) : ids);
  return { queue: [...arrange(reviews), ...arrange(newIds)], reviews: reviews.length, news: newIds.length };
}

/** 오늘 남은 복습 수와 새 한자 수 (하루 상한 - 오늘 판정한 수) */
export function dailyRoom(
  today: { reviewed: number; new_count: number } | undefined,
  newPerDay: number,
  reviewCap: number | null,
): { reviewRoom: number; newRoom: number } {
  const news = today?.new_count ?? 0;
  const reviews = (today?.reviewed ?? 0) - news;
  return {
    newRoom: Math.max(0, newPerDay - news),
    reviewRoom: reviewCap === null ? Number.POSITIVE_INFINITY : Math.max(0, reviewCap - reviews),
  };
}

export interface SrsProgressResult {
  progress: ChapterProgress;
  roundCompleted: boolean;
  chapterCompleted: boolean;
}

/**
 * 간격 반복 방식에서 한 한자를 판정한 뒤의 장 진행 (SPEC 4.2).
 * - 회독 수 : 장의 한자(졸업 제외)를 모두 한 번씩 본 시점마다 1 증가. round_queue는 이번 회독에서 아직 안 본 한자
 * - 장 완료 : 장의 모든 한자가 '알고있음'을 1회 이상 받았거나 졸업
 */
export function advanceSrsChapter(
  saved: ChapterProgress | undefined,
  level: number,
  chapter: number,
  ids: readonly string[],
  cardsAfter: ReadonlyMap<string, CardState>,
  gradedId: string,
  now: number,
): SrsProgressResult {
  const alive = (id: string) => cardsAfter.get(id)?.status !== 'graduated';
  const fresh = () => ids.filter(alive);
  const base: ChapterProgress =
    saved && saved.round_size > 0
      ? saved
      : { level, chapter, pass_count: saved?.pass_count ?? 0, completed_at: saved?.completed_at ?? null, round_queue: fresh(), round_size: fresh().length };

  const inChapter = new Set(ids);
  let queue = base.round_queue.filter((id) => id !== gradedId && inChapter.has(id) && alive(id));
  let { pass_count, round_size } = base;
  let roundCompleted = false;
  if (queue.length === 0) {
    pass_count += 1;
    roundCompleted = true;
    queue = fresh();
    round_size = queue.length;
  }
  let completed_at = base.completed_at;
  let chapterCompleted = false;
  if (completed_at === null && chapterDoneByCards(ids, cardsAfter)) {
    completed_at = now;
    chapterCompleted = true;
  }
  return { progress: { level, chapter, pass_count, completed_at, round_queue: queue, round_size }, roundCompleted, chapterCompleted };
}
