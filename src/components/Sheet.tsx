import { useEffect, type ReactNode } from 'react';
import styles from './Sheet.module.css';

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** 아래에서 올라오는 시트 (S2 장 미리보기, 확인창) */
export function Sheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.root}>
      <button type="button" className={styles.scrim} aria-label="닫기" onClick={onClose} />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={styles.handle} aria-hidden="true" />
        <h2 className={styles.title}>{title}</h2>
        {children}
      </section>
    </div>
  );
}
