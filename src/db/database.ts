import Dexie, { type EntityTable, type Table } from 'dexie';
import type { CardState, ChapterProgress, Direction, Rating } from '../domain/types';
import type { SessionCounts } from '../domain/session';

/** settings 테이블 한 행 (SPEC 3.3). 키는 SPEC 7장의 항목 이름 */
export interface SettingRow {
  key: string;
  value: unknown;
}

/** cards : 한자별 학습 상태. 키 [kanji_id+direction] */
export type CardRow = CardState;

/** review_logs : 판정 이력. 되돌리기와 통계에 쓴다 */
export interface ReviewLogRow {
  id?: number;
  kanji_id: string;
  direction: Direction;
  rating: Rating;
  ts: number;
  elapsed_ms: number;
  session_id: number;
}

/** sessions : 세션 기록 */
export interface SessionRow {
  id?: number;
  start: number;
  end: number | null;
  level: number;
  chapter: number;
  counts: SessionCounts;
}

/** chapters : 장별 회독 수와 현재 회독의 남은 한자. 키 [level+chapter] */
export type ChapterRow = ChapterProgress;

/** daily : 일별 학습 시간과 카드 수. 키 date(YYYY-MM-DD) */
export interface DailyRow {
  date: string;
  seconds: number;
  reviewed: number;
  new_count: number;
}

/** 기기 DB (IndexedDB, SPEC 3.3) */
class KanjiDatabase extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;
  cards!: Table<CardRow, [string, Direction]>;
  review_logs!: EntityTable<ReviewLogRow, 'id'>;
  sessions!: EntityTable<SessionRow, 'id'>;
  chapters!: Table<ChapterRow, [number, number]>;
  daily!: EntityTable<DailyRow, 'date'>;

  constructor() {
    super('kanji-app');
    this.version(1).stores({
      settings: 'key',
    });
    // M2 : 학습 기록 테이블 추가
    this.version(2).stores({
      settings: 'key',
      cards: '[kanji_id+direction], status, due',
      review_logs: '++id, kanji_id, ts, session_id',
      sessions: '++id, start',
      chapters: '[level+chapter]',
      daily: 'date',
    });
  }
}

export const db = new KanjiDatabase();
