import { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { exportBackup, importBackup } from '../db/backup';
import { backupFileName, parseBackup, type BackupFile, type BackupSummary } from '../domain/backup';
import { loadSettings } from '../settings/store';
import { loadOnboarding } from '../settings/onboarding';
import styles from './Settings.module.css';

/**
 * S8 7.5 백업 내보내기 · 가져오기
 * - 내보내기 : 기기 DB 전체를 JSON 파일 1개로 저장 (파일 이름에 날짜)
 * - 가져오기 : 파일을 검사한 뒤 확인창(백업 날짜, 한자 수, 판정 수, 덮어쓰기 경고)을 거쳐 복원
 */
export function BackupItem() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const onDone = (m: string) => {
    setError(null);
    setNotice(m);
  };
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName(backup.exported_at);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDone(`백업 파일(${a.download})을 저장했습니다.`);
    } catch (err) {
      console.warn('백업 내보내기 실패', err);
      setError('백업 파일을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('파일을 읽지 못했습니다.');
      return;
    }
    const r = parseBackup(text);
    if (r.ok) setPending({ backup: r.backup, summary: r.summary });
    else setError(r.reason);
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await importBackup(pending.backup);
      await Promise.all([loadSettings(), loadOnboarding()]);
      setPending(null);
      onDone('백업을 복원했습니다.');
    } catch (err) {
      console.warn('백업 복원 실패', err);
      setPending(null);
      setError('복원하지 못했습니다. 기존 기록은 그대로입니다.');
    } finally {
      setBusy(false);
    }
  };

  const s = pending?.summary;
  return (
    <div className={styles.item}>
      <span className={styles.label}>백업</span>
      <span className={styles.desc}>
        학습 기록과 설정 전체를 파일 하나로 저장합니다. 다른 기기나 브라우저에서 가져오면 그대로 이어집니다.
      </span>
      <Button block disabled={busy} onClick={() => void download()}>
        백업 내보내기
      </Button>
      <Button block disabled={busy} onClick={() => fileRef.current?.click()}>
        백업 가져오기
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {notice && (
        <p className={styles.desc} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Sheet open={pending !== null} title="이 백업으로 복원할까요?" onClose={() => setPending(null)}>
        {s && (
          <dl className={styles.info}>
            <dt>백업 날짜</dt>
            <dd>{new Date(s.exportedAt).toLocaleString('ko-KR')}</dd>
            <dt>학습한 한자</dt>
            <dd>{s.cards.toLocaleString('ko-KR')}자</dd>
            <dt>판정 기록</dt>
            <dd>{s.logs.toLocaleString('ko-KR')}회</dd>
            {s.appVersion && (
              <>
                <dt>앱 버전</dt>
                <dd>{s.appVersion}</dd>
              </>
            )}
          </dl>
        )}
        <p className={styles.sheetText}>지금 기기의 학습 기록과 설정을 모두 지우고 백업 내용으로 바꿉니다. 되돌릴 수 없습니다.</p>
        <div className={styles.sheetActions}>
          <Button tone="primary" block disabled={busy} onClick={() => void restore()}>
            덮어쓰고 복원
          </Button>
          <Button block onClick={() => setPending(null)}>
            취소
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
