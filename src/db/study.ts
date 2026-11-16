/**
 * 학습 기록 저장·불러오기. 판정 한 번은 하나의 트랜잭션으로 저장해,
 * 앱이 어느 순간에 닫혀도 카드 상태·회독 진행·판정 이력이 서로 어긋나지 않게 한다.
 */

import { db, type ChapterRow, type DailyRow, type ReviewLogRow } from './database';
import { advanceRound, gradeCard, initProgress, newCard, resetCard, settleProgress } from '../domain/scheduler';
import { capElapsed, dateKey } from '../domain/session';
import type { SessionCounts } from '../domain/session';
import type { CardOrder, CardState, ChapterProgress, Rating } from '../domain/types';

const FORWARD = 'forward' as const;

export async function getCards(ids: readonly string[]): Promise<Map<string, CardState>> {
  const rows = await db.cards.bulkGet(ids.map((id) => [id, FORWARD] as [string, typeof FORWARD]));
  const map = new Map<string, CardState>();
  rows.forEach((r) => r && map.set(r.kanji_id, r));
  return map;
}

export async function getAllCards(): Promise<Map<string, CardState>> {
  const rows = await db.cards.toArray();
  return new Map(rows.filter((r) => r.direction === FORWARD).map((r) => [r.kanji_id, r]));
}

export async function getAllChapters(): Promise<ChapterRow[]> {
  return db.chapters.toArray();
}

/**
 * 장을 연다. 진행 기록이 있으면 같은 회독의 남은 한자부터 이어서 돌려준다.
 * 없으면 1회독을 새로 시작해 저장한다.
 */
export async function openChapter(
  level: number,
  chapter: number,
  ids: readonly string[],
  order: CardOrder,
): Promise<{ progress: ChapterProgress; cards: Map<string, CardState> }> {
  return db.transaction('rw', db.cards, db.chapters, async () => {
    const cards = await getCards(ids);
    const saved = await db.chapters.get([level, chapter]);
    let progress: ChapterProgress;
    if (!saved || saved.round_size === 0) {
      progress = saved?.completed_at
        ? saved
        : { ...initProgress(level, chapter, ids, cards, order, Math.random, Date.now()), pass_count: saved?.pass_count ?? 0 };
    } else {
      progress = settleProgress(saved, ids, cards, order, Math.random, Date.now()).progress;
    }
    if (JSON.stringify(progress) !== JSON.stringify(saved)) await db.chapters.put(progress);
    return { progress, cards };
  });
}

export async function startSession(level: number, chapter: number): Promise<number> {
  return (await db.sessions.add({ start: Date.now(), end: null, level, chapter, counts: { study: 0, vague: 0, know: 0 } })) as number;
}

export async function finishSession(id: number, counts: SessionCounts): Promise<void> {
  await db.sessions.update(id, { end: Date.now(), counts });
}

/** 되돌리기에 쓰는 판정 직전 상태 (메모리에만 보관, SPEC 4.3) */
export interface UndoSnapshot {
  logId: number;
  cardBefore: CardState | undefined;
  progressBefore: ChapterProgress | null;
  dailyBefore: DailyRow | undefined;
}

export interface GradeInput {
  kanjiId: string;
  rating: Rating;
  elapsedMs: number;
  sessionId: number;
  /** 회독 진행에 반영할 때 (공부하겠음만 다시 연습에서는 null) */
  round: { progress: ChapterProgress; ids: readonly string[]; order: CardOrder } | null;
}

export interface GradeOutput {
  card: CardState;
  progress: ChapterProgress | null;
  roundCompleted: boolean;
  chapterCompleted: boolean;
  undo: UndoSnapshot;
}

export async function recordGrade(input: GradeInput): Promise<GradeOutput> {
  const now = Date.now();
  const elapsed = capElapsed(input.elapsedMs);
  return db.transaction('rw', [db.cards, db.chapters, db.review_logs, db.daily], async () => {
    const cardBefore = await db.cards.get([input.kanjiId, FORWARD]);
    const card = gradeCard(cardBefore ?? newCard(input.kanjiId), input.rating, now);
    await db.cards.put(card);

    const logId = (await db.review_logs.add({
      kanji_id: input.kanjiId,
      direction: FORWARD,
      rating: input.rating,
      ts: now,
      elapsed_ms: elapsed,
      session_id: input.sessionId,
    } satisfies ReviewLogRow)) as number;

    const key = dateKey(now);
    const dailyBefore = await db.daily.get(key);
    await db.daily.put({
      date: key,
      seconds: (dailyBefore?.seconds ?? 0) + Math.round(elapsed / 1000),
      reviewed: (dailyBefore?.reviewed ?? 0) + 1,
      new_count: (dailyBefore?.new_count ?? 0) + (cardBefore && cardBefore.status !== 'new' ? 0 : 1),
    });

    let progress: ChapterProgress | null = null;
    let roundCompleted = false;
    let chapterCompleted = false;
    let progressBefore: ChapterProgress | null = null;
    if (input.round) {
      const { ids, order } = input.round;
      progressBefore = (await db.chapters.get([input.round.progress.level, input.round.progress.chapter])) ?? input.round.progress;
      const cards = await getCards(ids);
      const r = advanceRound(progressBefore, input.kanjiId, ids, cards, order, Math.random, now);
      progress = r.progress;
      roundCompleted = r.roundCompleted;
      chapterCompleted = r.chapterCompleted;
      await db.chapters.put(progress);
    }

    return { card, progress, roundCompleted, chapterCompleted, undo: { logId, cardBefore, progressBefore, dailyBefore } };
  });
}

/** 직전 판정 1건 되돌리기 : 이력 삭제, 카드·회독·일별 기록을 판정 전 값으로 */
export async function undoGrade(s: UndoSnapshot, kanjiId: string): Promise<void> {
  await db.transaction('rw', [db.cards, db.chapters, db.review_logs, db.daily], async () => {
    await db.review_logs.delete(s.logId);
    if (s.cardBefore) await db.cards.put(s.cardBefore);
    else await db.cards.delete([kanjiId, FORWARD]);
    if (s.progressBefore) await db.chapters.put(s.progressBefore);
    const key = dateKey(Date.now());
    if (s.dailyBefore) await db.daily.put(s.dailyBefore);
    else await db.daily.delete(key);
  });
}

export async function toggleFavorite(kanjiId: string): Promise<boolean> {
  return db.transaction('rw', db.cards, async () => {
    const card = (await db.cards.get([kanjiId, FORWARD])) ?? newCard(kanjiId);
    const next = { ...card, favorite: !card.favorite };
    await db.cards.put(next);
    return next.favorite;
  });
}

/** "처음부터 다시" : 장의 카드를 새 한자로(즐겨찾기 유지), 회독 수 0, 새 1회독 */
export async function resetChapter(level: number, chapter: number, ids: readonly string[], order: CardOrder): Promise<void> {
  await db.transaction('rw', db.cards, db.chapters, async () => {
    const cards = await getCards(ids);
    const reset = [...cards.values()].map(resetCard);
    await db.cards.bulkPut(reset);
    await db.chapters.put(initProgress(level, chapter, ids, new Map(), order, Math.random, Date.now()));
  });
}
