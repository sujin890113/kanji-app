import styles from './ProgressBar.module.css';

/** 진행 막대. 판정마다 한 칸씩 채워짐 (200ms) */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}
