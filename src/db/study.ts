/**
 * 학습 기록 저장·불러오기. 판정 한 번은 하나의 트랜잭션으로 저장해,
 * 앱이 어느 순간에 닫혀도 카드 상태·회독 진행·판정 이력이 서로 어긋나지 않게 한다.
 */

import Dexie from 'dexie';
import { db, type ChapterRow, type DailyRow, type ReviewLogRow } from './database';
import { advanceRound, gradeCard, initProgress, newCard, resetCard, settleProgress } from '../domain/scheduler';
import { capElapsed, dateKey } from '../domain/session';
import { advanceSrsChapter, gradeSrs, type SrsOptions } from '../domain/srs';
import { rechunkProgress, startLevelProgress, type ChapterIds, type LevelOutline } from '../domain/progress';
import type { SessionCounts } from '../domain/session';
import type { CardOrder, CardState, ChapterProgress, Direction, Rating } from '../domain/types';

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

/** 역방향(F7) 카드 전체 */
export async function getAllReverseCards(): Promise<Map<string, CardState>> {
  const rows = await db.cards.toArray();
  return new Map(rows.filter((r) => r.direction === 'reverse').map((r) => [r.kanji_id, r]));
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

/** 세션 시작. 오늘 학습(여러 장에 걸친 간격 반복 세션)은 level -1, chapter 0으로 기록한다 */
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
  /** 판정 전 장 진행 기록. undefined면 기록이 없었음(되돌릴 때 지움) */
  progressBefore: ChapterProgress | undefined;
  progressKey: [number, number] | null;
  dailyBefore: DailyRow | undefined;
  direction: Direction;
}

export interface GradeInput {
  kanjiId: string;
  /** 카드 방향. 역방향(F7)은 장 진행에 반영하지 않는다 (chapter : null) */
  direction?: Direction;
  rating: Rating;
  elapsedMs: number;
  sessionId: number;
  /** 카드 판정 방식 : 회독(F5 끔) 또는 간격 반복(F5 켬) */
  scheduler: { kind: 'round' } | { kind: 'srs'; options: SrsOptions };
  /** 장 진행에 반영할 장 ([공부하겠음만 다시] 연습에서는 null) */
  chapter: { level: number; chapter: number; ids: readonly string[]; order: CardOrder } | null;
  /** 회독 방식의 애매함 : 이 한자를 회독 목록의 이 위치로 옮긴다 (같은 세션 뒤쪽에 한 번 더) */
  requeueAt?: number;
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
    const direction = input.direction ?? FORWARD;
    const cardBefore = await db.cards.get([input.kanjiId, direction]);
    const start = cardBefore ?? newCard(input.kanjiId, direction);
    const card =
      input.scheduler.kind === 'srs'
        ? gradeSrs(start, input.rating, now, input.scheduler.options)
        : gradeCard(start, input.rating, now);
    await db.cards.put(card);

    const logId = (await db.review_logs.add({
      kanji_id: input.kanjiId,
      direction,
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
    let progressBefore: ChapterProgress | undefined;
    let progressKey: [number, number] | null = null;
    // 역방향 판정은 장 진행·회독에 반영하지 않는다
    const ch = direction === FORWARD ? input.chapter : null;
    if (ch) {
      progressKey = [ch.level, ch.chapter];
      progressBefore = await db.chapters.get(progressKey);
      const cards = await getCards(ch.ids);
      let r: { progress: ChapterProgress; roundCompleted: boolean; chapterCompleted: boolean } | null = null;
      if (input.scheduler.kind === 'srs') {
        r = advanceSrsChapter(progressBefore, ch.level, ch.chapter, ch.ids, cards, input.kanjiId, now);
      } else if (progressBefore) {
        r = advanceRound(progressBefore, input.kanjiId, ch.ids, cards, ch.order, Math.random, now, input.requeueAt);
      }
      if (r) {
        progress = r.progress;
        roundCompleted = r.roundCompleted;
        chapterCompleted = r.chapterCompleted;
        await db.chapters.put(progress);
      }
    }

    return {
      card,
      progress,
      roundCompleted,
      chapterCompleted,
      undo: { logId, cardBefore, progressBefore, progressKey, dailyBefore, direction },
    };
  });
}

/** 직전 판정 1건 되돌리기 : 이력 삭제, 카드·회독·일별 기록을 판정 전 값으로 */
export async function undoGrade(s: UndoSnapshot, kanjiId: string): Promise<void> {
  await db.transaction('rw', [db.cards, db.chapters, db.review_logs, db.daily], async () => {
    await db.review_logs.delete(s.logId);
    if (s.cardBefore) await db.cards.put(s.cardBefore);
    else await db.cards.delete([kanjiId, s.direction]);
    if (s.progressBefore) await db.chapters.put(s.progressBefore);
    else if (s.progressKey) await db.chapters.delete(s.progressKey);
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

/** 오늘 날짜의 일별 기록 */
export async function getToday(): Promise<DailyRow | undefined> {
  return db.daily.get(dateKey(Date.now()));
}

export async function getAllDaily(): Promise<DailyRow[]> {
  return db.daily.toArray();
}

/**
 * 장 크기 변경 (SPEC 7.3) : 장별 회독 수를 초기화하고, 장 완료는 한자별 학습 상태로 다시 계산한다.
 * 한자별 학습 상태(cards)는 그대로 둔다.
 */
export async function applyChapterSize(chapters: readonly ChapterIds[], skipped: ReadonlySet<number> = new Set()): Promise<void> {
  await db.transaction('rw', db.cards, db.chapters, async () => {
    const cards = await getAllCards();
    await db.chapters.clear();
    await db.chapters.bulkPut(rechunkProgress(chapters, cards, Date.now(), skipped));
  });
}

/** 시작 급수 고르기 : 앞 급수의 장을 완료로 기록한다 (카드 상태는 그대로) */
export async function applyStartLevel(outline: readonly LevelOutline[], start: number): Promise<void> {
  await db.transaction('rw', db.chapters, async () => {
    const existing = await db.chapters.toArray();
    await db.chapters.bulkPut(startLevelProgress(outline, start, existing, Date.now()));
  });
}

/** 급수별 초기화 (SPEC 7.5) : 그 급수 한자의 학습 상태와 장 진행만 지운다 (즐겨찾기는 유지) */
export async function resetLevel(level: number, ids: readonly string[]): Promise<void> {
  await db.transaction('rw', db.cards, db.chapters, async () => {
    const idSet = new Set(ids);
    const rows = await db.cards.filter((c) => idSet.has(c.kanji_id)).toArray();
    const keep = rows.filter((c) => c.favorite).map(resetCard);
    await db.cards.bulkDelete(rows.map((c) => [c.kanji_id, c.direction] as [string, typeof c.direction]));
    await db.cards.bulkPut(keep);
    await db.chapters.where('[level+chapter]').between([level, Dexie.minKey], [level, Dexie.maxKey]).delete();
  });
}

/** 전체 초기화 (SPEC 7.5) : 학습 기록을 모두 지운다. 설정은 남긴다 */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.cards, db.chapters, db.review_logs, db.sessions, db.daily], async () => {
    await Promise.all([db.cards.clear(), db.chapters.clear(), db.review_logs.clear(), db.sessions.clear(), db.daily.clear()]);
  });
}

/** 한자 한 자의 학습 상태 초기화 (S5 내 기록). 즐겨찾기와 판정 이력은 남긴다. 이미 완료한 장은 다시 잠그지 않는다 */
export async function resetKanji(kanjiId: string): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get([kanjiId, FORWARD]);
    if (card) await db.cards.put(resetCard(card));
    // 역방향(F7) 카드도 처음부터
    await db.cards.delete([kanjiId, 'reverse']);
  });
}

/** 한 한자의 최근 판정 이력 (새것부터) */
export async function getKanjiLogs(kanjiId: string, limit: number): Promise<ReviewLogRow[]> {
  const rows = await db.review_logs.where('kanji_id').equals(kanjiId).toArray();
  return rows
    .filter((r) => r.direction === FORWARD)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

/** 정방향 판정 이력 전체 (기록 순서). 격자의 '애매' 표시와 통계에 쓴다 */
export async function getForwardLogs(): Promise<ReviewLogRow[]> {
  const rows = await db.review_logs.orderBy('id').toArray();
  return rows.filter((r) => r.direction === FORWARD);
}
