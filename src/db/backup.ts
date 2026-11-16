import { db } from './database';
import { BACKUP_TABLES, buildBackup, type BackupFile, type BackupTables } from '../domain/backup';

/** 기기 DB 전체를 백업 형식으로 읽는다 (SPEC 7.5) */
export async function exportBackup(now = Date.now()): Promise<BackupFile> {
  const tables = await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    const rows = await Promise.all(BACKUP_TABLES.map((t) => db.table(t).toArray()));
    return Object.fromEntries(BACKUP_TABLES.map((t, i) => [t, rows[i]])) as BackupTables;
  });
  return buildBackup(tables, __APP_VERSION__, now);
}

/** 검사를 마친 백업으로 기기 DB 전체를 덮어쓴다. 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다 */
export async function importBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkPut(backup.tables[t]);
    }
  });
}
