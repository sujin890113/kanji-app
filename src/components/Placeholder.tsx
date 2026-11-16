import type { ReactNode } from 'react';
import styles from './Placeholder.module.css';

interface Props {
  /** 화면 번호 (SPEC 6장) */
  code: string;
  /** 이 화면을 채울 개발 단계 (SPEC 9장) */
  milestone: string;
  children?: ReactNode;
}

/** 아직 만들지 않은 화면 자리 표시 (M0) */
export function Placeholder({ code, milestone, children }: Props) {
  return (
    <section className={styles.card}>
      <p className={styles.meta}>
        <span className={styles.code}>{code}</span>
        <span>{milestone}에서 만듭니다</span>
      </p>
      {children}
    </section>
  );
}
