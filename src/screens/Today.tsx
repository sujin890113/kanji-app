import { Link } from 'react-router';
import { ScreenShell, shellStyles } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { SearchIcon } from '../components/icons';
import { getChapter, levelName, type Content } from '../content/content';
import { chapterKey, currentChapter } from '../domain/progress';
import { roundDone, roundNumber } from '../domain/scheduler';
import { getAllChapters } from '../db/study';
import { useLive } from '../db/useLive';
import { useSettings } from '../settings/useSettings';
import { useNavigate } from 'react-router';
import styles from './screens.module.css';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

/** S1 오늘(홈). 전체 화면은 M3. M2에서는 지금 학습할 장으로 이어가는 버튼만 둔다 */
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
      <ContentGate>{(content) => <ContinueCard content={content} />}</ContentGate>
      <Placeholder code="S1 오늘" milestone="M3">
        <p>연속 학습일, 복습 예정, 전체 진도</p>
      </Placeholder>
    </ScreenShell>
  );
}

function ContinueCard({ content }: { content: Content }) {
  const [settings] = useSettings();
  const navigate = useNavigate();
  const rows = useLive(getAllChapters);
  if (!rows) return null;
  const done = new Set(rows.filter((r) => r.completed_at !== null).map((r) => chapterKey(r.level, r.chapter)));
  const cur = currentChapter(content.outline, done, settings.level_lock);
  if (!cur) return <p className={styles.note}>모든 장을 완료했습니다.</p>;
  const p = rows.find((r) => r.level === cur.level && r.chapter === cur.chapter);
  const ch = getChapter(content, cur.level, cur.chapter);
  const preview = ch?.ids.slice(0, 6).join(' ') ?? '';
  return (
    <section className={styles.settingRow} aria-label="지금 학습할 장">
      <span className={styles.settingLabel}>
        {levelName(cur.level)} · {cur.chapter}장 · {p ? `${roundNumber(p)}회독 · ${roundDone(p)}/${p.round_size}` : '1회독'}
      </span>
      <p lang="ja" className={styles.preview}>
        {preview} …
      </p>
      <Button tone="primary" block onClick={() => navigate(`/study/${cur.level}/${cur.chapter}`)}>
        {p ? '이어서 학습' : '학습 시작'}
      </Button>
    </section>
  );
}
