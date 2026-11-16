import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BackIcon } from './icons';
import styles from './ScreenShell.module.css';

interface Props {
  title: ReactNode;
  /** 탭을 숨기는 화면에서 뒤로 가기 버튼 표시 */
  back?: boolean;
  /** 머리글 오른쪽 버튼 자리 */
  actions?: ReactNode;
  children?: ReactNode;
}

/** 모든 화면의 공통 틀 : 머리글 + 본문. 폭 480px 가운데 정렬 (SPEC 5.5) */
export function ScreenShell({ title, back = false, actions, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {back && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="뒤로"
            onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            <BackIcon />
          </button>
        )}
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <main className={styles.body}>{children}</main>
    </div>
  );
}

export const shellStyles = styles;
