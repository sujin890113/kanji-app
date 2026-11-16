/**
 * 백업 파일 형식 (SPEC 7.5)
 * - 사용자 데이터 전체(설정, 카드, 판정 이력, 세션, 장 진행, 일별 기록)를 JSON 파일 1개로 저장한다.
 * - 가져오기 전에 파일을 검사한다. 잘못된 파일이면 이유 한 줄을 돌려주고 아무것도 바꾸지 않는다.
 * 화면·DB 코드에 의존하지 않는 순수 함수.
 */

export const BACKUP_FORMAT = 'sangyong-kanji-backup';
export const BACKUP_VERSION = 1;

export const BACKUP_TABLES = ['settings', 'cards', 'review_logs', 'sessions', 'chapters', 'daily'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupTables = Record<BackupTable, Record<string, unknown>[]>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  app_version: string;
  exported_at: number;
  tables: BackupTables;
}

export interface BackupSummary {
  exportedAt: number;
  appVersion: string;
  /** 한 번이라도 판정한 한자 수 (정방향 카드 중 미학습이 아닌 것) */
  cards: number;
  logs: number;
  sessions: number;
}

export type ParseResult = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; reason: string };

export function buildBackup(tables: BackupTables, appVersion: string, now: number): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app_version: appVersion, exported_at: now, tables };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 상용한자-백업-YYYY-MM-DD.json (기기 시간 기준 날짜) */
export function backupFileName(now: number): string {
  const d = new Date(now);
  return `상용한자-백업-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export function summarizeBackup(b: BackupFile): BackupSummary {
  return {
    exportedAt: b.exported_at,
    appVersion: b.app_version,
    cards: b.tables.cards.filter((c) => c.direction === 'forward' && c.status !== 'new').length,
    logs: b.tables.review_logs.length,
    sessions: b.tables.sessions.length,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const oneOf = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

/** 표별 행 검사. 앱이 읽을 때 꼭 필요한 필드만 본다 */
const ROW_CHECK: Record<BackupTable, (r: Record<string, unknown>) => boolean> = {
  settings: (r) => isStr(r.key) && 'value' in r,
  cards: (r) =>
    isStr(r.kanji_id) &&
    oneOf(r.direction, ['forward', 'reverse']) &&
    oneOf(r.status, ['new', 'learning', 'review', 'graduated']) &&
    isNumOrNull(r.due) &&
    isNum(r.pass_count) &&
    typeof r.favorite === 'boolean',
  review_logs: (r) =>
    isStr(r.kanji_id) &&
    oneOf(r.direction, ['forward', 'reverse']) &&
    oneOf(r.rating, ['study', 'vague', 'know', 'graduate']) &&
    isNum(r.ts) &&
    (r.id === undefined || isNum(r.id)),
  sessions: (r) => isNum(r.start) && isNumOrNull(r.end) && (r.id === undefined || isNum(r.id)),
  chapters: (r) => isNum(r.level) && isNum(r.chapter) && isNumOrNull(r.completed_at) && Array.isArray(r.round_queue),
  daily: (r) => typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && isNum(r.seconds),
};

const TABLE_LABEL: Record<BackupTable, string> = {
  settings: '설정',
  cards: '카드',
  review_logs: '판정 이력',
  sessions: '세션',
  chapters: '장 진행',
  daily: '일별 기록',
};

/** 파일 내용을 검사해 백업으로 읽는다 */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON 파일이 아니거나 내용이 손상되었습니다.' };
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, reason: '이 앱의 백업 파일이 아닙니다.' };
  }
  if (!isNum(data.version) || data.version < 1) {
    return { ok: false, reason: '백업 파일의 형식 버전을 알 수 없습니다.' };
  }
  if (data.version > BACKUP_VERSION) {
    return { ok: false, reason: '더 새 버전의 앱에서 만든 백업입니다. 앱을 새로 고친 뒤 다시 시도하세요.' };
  }
  if (!isNum(data.exported_at)) {
    return { ok: false, reason: '백업 날짜가 없습니다.' };
  }
  if (!isObj(data.tables)) {
    return { ok: false, reason: '백업 파일에 기록이 없습니다.' };
  }
  const tables = data.tables;
  for (const t of BACKUP_TABLES) {
    const rows = tables[t];
    if (!Array.isArray(rows)) {
      return { ok: false, reason: `백업 파일에 ${TABLE_LABEL[t]} 항목이 없습니다.` };
    }
    const bad = rows.findIndex((r) => !isObj(r) || !ROW_CHECK[t](r));
    if (bad >= 0) {
      return { ok: false, reason: `${TABLE_LABEL[t]} ${bad + 1}번째 항목의 형식이 올바르지 않습니다.` };
    }
  }
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: data.version,
    app_version: typeof data.app_version === 'string' ? data.app_version : '',
    exported_at: data.exported_at,
    tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, tables[t]])) as BackupTables,
  };
  return { ok: true, backup, summary: summarizeBackup(backup) };
}
