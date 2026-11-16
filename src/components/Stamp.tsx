import styles from './Stamp.module.css';

/** 주홍 도장(済). 장 완료 표시 (SPEC 5.2-5). 움직임은 animate일 때만 (M7에서 다듬음) */
export function Stamp({ size = 'small', animate = false }: { size?: 'small' | 'large'; animate?: boolean }) {
  return (
    <span className={`${styles.stamp} ${styles[size]} ${animate ? styles.animate : ''}`} lang="ja" aria-label="완료">
      済
    </span>
  );
}
