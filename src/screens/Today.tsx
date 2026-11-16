import { Link } from 'react-router';
import { ScreenShell, shellStyles } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';
import { KanjiSample } from '../components/KanjiSample';
import { SearchIcon } from '../components/icons';
import styles from './screens.module.css';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

/** S1 오늘(홈) */
export function Today() {
  return (
    <ScreenShell
      title={<span className={styles.date}>{dateFormat.format(new Date())}</span>}
      actions={
        <Link to="/search" className={shellStyles.iconButton} aria-label="검색">
          <SearchIcon />
        </Link>
      }
    >
      <Placeholder code="S1 오늘" milestone="M3">
        <KanjiSample kanji="貼" />
      </Placeholder>

      <h2 className={styles.sectionTitle}>개발용 바로가기 (탭이 없는 화면)</h2>
      <ul className={styles.devLinks}>
        <li><Link className={styles.devLink} to="/study">S3 학습 카드</Link></li>
        <li><Link className={styles.devLink} to="/result">S4 세션 결과</Link></li>
        <li><Link className={styles.devLink} to={`/kanji/${encodeURIComponent('貼')}`}>S5 한자 상세</Link></li>
        <li><Link className={styles.devLink} to="/search">S9 검색</Link></li>
      </ul>
    </ScreenShell>
  );
}
