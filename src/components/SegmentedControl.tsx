import type { Choice } from '../settings/definitions';
import styles from './SegmentedControl.module.css';

interface Props<T> {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}

/** 선택지 중 하나를 고르는 버튼 묶음 (설정 화면) */
export function SegmentedControl<T>({ label, value, choices, onChange }: Props<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {choices.map((c) => {
        const checked = c.value === value;
        return (
          <button
            key={String(c.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            className={checked ? `${styles.option} ${styles.checked}` : styles.option}
            onClick={() => onChange(c.value)}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
