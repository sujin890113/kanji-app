import styles from './KanjiSample.module.css';

interface Props {
  /** 일본 신자체 */
  kanji: string;
  /** 한국 정자체 (자형이 다를 때만) */
  koForm?: string;
}

/**
 * 글꼴 확인용 견본 (M0).
 * 일본 한자는 lang="ja", 한국 정자체는 lang="ko"로 표시한다 (SPEC 5.4).
 */
export function KanjiSample({ kanji, koForm }: Props) {
  return (
    <div className={styles.sample}>
      <span lang="ja" className={styles.kanji}>
        {kanji}
      </span>
      {koForm && (
        <span lang="ko" className={styles.koForm}>
          {koForm}
        </span>
      )}
    </div>
  );
}
