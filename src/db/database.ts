import Dexie, { type EntityTable } from 'dexie';

/** settings 테이블 한 행 (SPEC 3.3). 키는 SPEC 7장의 항목 이름 */
export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * 기기 DB (IndexedDB).
 * M0에서는 settings 테이블만 정의한다. cards, review_logs, sessions, chapters, daily는 M2에서 추가한다.
 */
class KanjiDatabase extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;

  constructor() {
    super('kanji-app');
    this.version(1).stores({
      settings: 'key',
    });
  }
}

export const db = new KanjiDatabase();
