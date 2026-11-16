import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Tone = 'primary' | 'study' | 'vague' | 'know' | 'plain';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  block?: boolean;
}

/** 입체감 있는 버튼 : 아래쪽 4px 짙은 테두리, 누르면 4px 내려앉음 (SPEC 5.5) */
export function Button({ tone = 'plain', block = false, className, ...rest }: Props) {
  const cls = [styles.button, styles[tone], block ? styles.block : '', className ?? ''].join(' ');
  return <button type="button" className={cls} {...rest} />;
}
