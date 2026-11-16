import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, backupFileName, buildBackup, parseBackup, type BackupTables } from './backup';

const tables = (): BackupTables => ({
  settings: [{ key: 'f5_srs', value: true }],
  cards: [
    { kanji_id: 'k1', direction: 'forward', status: 'review', due: 100, pass_count: 1, favorite: false },
    { kanji_id: 'k1', direction: 'reverse', status: 'learning', due: null, pass_count: 0, favorite: false },
    { kanji_id: 'k2', direction: 'forward', status: 'new', due: null, pass_count: 0, favorite: true },
  ],
  review_logs: [{ id: 1, kanji_id: 'k1', direction: 'forward', rating: 'know', ts: 5, elapsed_ms: 900, session_id: 1 }],
  sessions: [{ id: 1, start: 1, end: 9, level: 5, chapter: 1, counts: {} }],
  chapters: [{ level: 5, chapter: 1, pass_count: 1, completed_at: 9, round_queue: [], round_size: 0 }],
  daily: [{ date: '2026-11-17', seconds: 60, reviewed: 3, new_count: 2 }],
});

describe('백업 파일', () => {
  it('파일 이름에 기기 날짜가 들어간다', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 0).getTime())).toBe('상용한자-백업-2026-01-05.json');
  });

  it('내보낸 내용을 그대로 다시 읽고 요약한다', () => {
    const b = buildBackup(tables(), '0.7.0', 1234);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup).toEqual(b);
    expect(r.summary).toEqual({ exportedAt: 1234, appVersion: '0.7.0', cards: 1, logs: 1, sessions: 1 });
  });

  it('잘못된 파일은 이유 한 줄과 함께 거절한다', () => {
    const reason = (text: string) => {
      const r = parseBackup(text);
      return r.ok ? null : r.reason;
    };
    const good = buildBackup(tables(), '0.7.0', 1);
    expect(reason('{')).toMatch(/JSON/);
    expect(reason('[]')).toMatch(/백업 파일이 아닙니다/);
    expect(reason(JSON.stringify({ ...good, format: 'other' }))).toMatch(/백업 파일이 아닙니다/);
    expect(reason(JSON.stringify({ ...good, version: 99 }))).toMatch(/새 버전/);
    expect(reason(JSON.stringify({ ...good, exported_at: 'x' }))).toMatch(/날짜/);
    const noDaily = { ...good, tables: { ...good.tables, daily: undefined } };
    expect(reason(JSON.stringify(noDaily))).toBe('백업 파일에 일별 기록 항목이 없습니다.');
    const badCard = tables();
    badCard.cards[1].status = 'done';
    expect(reason(JSON.stringify(buildBackup(badCard, '', 1)))).toBe('카드 2번째 항목의 형식이 올바르지 않습니다.');
    expect(BACKUP_FORMAT).toBeTruthy();
  });
});
