import { useRef, useState } from 'react';
import type { Rating } from '../domain/types';
import styles from './GradeButtons.module.css';

interface Props {
  /** F6 3단계 자기평가 (M3에서 설정과 연결) */
  threeGrade: boolean;
  /** 길게 눌러 졸업 (longpress_graduate) */
  longPress: boolean;
  disabled: boolean;
  onGrade: (rating: Rating) => void;
}

const HOLD_MS = 600; // SPEC 5.6 : 누르는 동안 600ms 게이지

/** 판정 버튼 : 왼쪽부터 공부하겠음, (애매함), 알고있음. 알고있음 길게 누르기 = 졸업 */
export function GradeButtons({ threeGrade, longPress, disabled, onGrade }: Props) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const onKnowDown = () => {
    if (!longPress || disabled) return;
    fired.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      clear();
      navigator.vibrate?.(80);
      onGrade('graduate');
    }, HOLD_MS);
  };

  const onKnowClick = () => {
    if (fired.current) {
      fired.current = false; // 길게 눌러 이미 졸업 처리됨
      return;
    }
    onGrade('know');
  };

  return (
    <div className={`${styles.row} ${threeGrade ? styles.three : ''}`}>
      <button type="button" className={`${styles.grade} ${styles.study}`} disabled={disabled} onClick={() => onGrade('study')}>
        공부하겠음
      </button>
      {threeGrade && (
        <button type="button" className={`${styles.grade} ${styles.vague}`} disabled={disabled} onClick={() => onGrade('vague')}>
          애매함
        </button>
      )}
      <button
        type="button"
        className={`${styles.grade} ${styles.know} ${holding ? styles.holding : ''}`}
        disabled={disabled}
        onPointerDown={onKnowDown}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onKnowClick}
        aria-description={longPress ? '길게 누르면 졸업' : undefined}
      >
        <span className={styles.gauge} aria-hidden="true" />
        <span className={styles.label}>알고있음</span>
        {longPress && <span className={styles.hint}>길게 누르면 졸업</span>}
      </button>
    </div>
  );
}
