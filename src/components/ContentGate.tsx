import type { ReactNode } from 'react';
import { loadContent, useContentState, type Content } from '../content/content';
import styles from './ContentGate.module.css';

/** 콘텐츠를 다 불러온 뒤에 화면을 그린다. 실패하면 원인 한 줄과 [다시 시도] (SPEC 6장 예외 화면) */
export function ContentGate({ children }: { children: (content: Content) => ReactNode }) {
  const state = useContentState();
  if (state.status === 'loading') {
    return <p className={styles.message}>한자 데이터를 불러오는 중…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className={styles.error}>
        <p className={styles.message}>{state.message}</p>
        <button type="button" className={styles.retry} onClick={() => void loadContent()}>
          다시 시도
        </button>
      </div>
    );
  }
  return <>{children(state.content)}</>;
}
