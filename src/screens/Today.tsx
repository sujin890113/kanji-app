import { Link, useNavigate } from 'react-router';
import { ScreenShell, shellStyles } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { Stamp } from '../components/Stamp';
import { SearchIcon } from '../components/icons';
import { getChapter, levelName, type Content } from '../content/content';
import { chapterKey, isKnownOnce } from '../domain/progress';
import { isRemaining, roundDone, roundNumber } from '../domain/scheduler';
import { dateKey } from '../domain/session';
import { buildSrsQueue, dailyRoom } from '../domain/srs';
import { streakDays, weekForecast } from '../domain/stats';
import { getAllDaily } from '../db/study';
import { useLive } from '../db/useLive';
import { useProgressView } from '../db/useProgress';
import { useSettings } from '../settings/useSettings';
import { aheadChapter } from './Study';
import styles from './Today.module.css';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** S1 오늘(홈) : 열자마자 할 일과 시작 버튼 */
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
      <ContentGate>{(content) => <TodayBody content={content} />}</ContentGate>
    </ScreenShell>
  );
}

function TodayBody({ content }: { content: Content }) {
  const [settings] = useSettings();
  const navigate = useNavigate();
  const view = useProgressView(content);
  const daily = useLive(getAllDaily);
  if (!view || !daily) return <p className={styles.muted}>기록을 불러오는 중…</p>;

  const now = Date.now();
  const { cards, rows, summary } = view;
  const today = daily.find((d) => d.date === dateKey(now));
  const cur = summary.current;
  const ch = cur ? getChapter(content, cur.level, cur.chapter) : undefined;
  const progress = cur ? rows.find((r) => r.level === cur.level && r.chapter === cur.chapter) : undefined;

  // 오늘 할 것 : F5 켬이면 복습·새 한자 수, 끔이면 현재 장의 남은 한자 수
  let reviews = 0;
  let news = 0;
  if (settings.f5_srs) {
    const room = dailyRoom(today, settings.srs_new_per_day, settings.srs_review_cap);
    const newCandidates = content.chapters
      .filter((c) => summary.open.has(chapterKey(c.level, c.chapter)) && !summary.completed.has(chapterKey(c.level, c.chapter)))
      .flatMap((c) => c.ids);
    const q = buildSrsQueue({
      pool: [...cards.values()],
      newCandidates,
      cards,
      now,
      ...room,
      size: Number.POSITIVE_INFINITY,
      order: 'sequential',
      rng: Math.random,
    });
    reviews = q.reviews;
    news = q.news;
  }
  const remaining = ch ? ch.ids.filter((id) => isRemaining(cards.get(id))).length : 0;
  const nothingToday = settings.f5_srs ? reviews + news === 0 : !cur;
  const ahead = nothingToday ? aheadChapter(content, summary.open, cards) : null;

  // 현재 장 카드의 진행 막대 : 회독은 이번 회독 진행, 간격 반복은 알고있음 이상 수
  let barValue = 0;
  let barMax = 1;
  let roundText = '';
  if (ch) {
    if (settings.f5_srs) {
      barValue = ch.ids.filter((id) => isKnownOnce(cards.get(id))).length;
      barMax = ch.ids.length;
    } else if (progress && progress.round_size > 0) {
      barValue = roundDone(progress);
      barMax = progress.round_size;
    } else {
      barMax = ch.ids.length;
    }
    roundText = progress && progress.round_size > 0 ? `${roundNumber(progress)}회독` : '1회독';
  }

  const studied = today?.reviewed ?? 0;
  const known = [...cards.values()].filter((c) => isKnownOnce(c)).length;

  return (
    <>
      {settings.f12_stats && (
        <p className={styles.streak}>
          <span className={styles.streakNo}>{streakDays(daily.filter((d) => d.reviewed > 0).map((d) => d.date), now)}일</span> 연속
          학습 · 오늘 {studied}/{settings.daily_goal}자
        </p>
      )}

      {cur && ch ? (
        <section className={styles.card} aria-label="지금 학습할 장">
          <span className={styles.cardTitle}>
            {levelName(cur.level)} · {cur.chapter}장 · {roundText}
          </span>
          <p lang="ja" className={styles.preview}>
            {ch.ids.slice(0, 6).join(' ')}
            {ch.ids.length > 6 ? ' …' : ''}
          </p>
          <div className={styles.barRow}>
            <ProgressBar value={barValue} max={barMax} label="현재 장 진행" />
            <span className={styles.barText}>
              {barValue}/{barMax}
            </span>
          </div>
        </section>
      ) : (
        <p className={styles.muted}>열려 있는 장을 모두 완료했습니다.</p>
      )}

      <div className={styles.counts}>
        {settings.f5_srs ? (
          <>
            <span>
              복습 <strong>{reviews}</strong>
            </span>
            <span>
              새 한자 <strong>{news}</strong>
            </span>
          </>
        ) : (
          <span>
            남은 한자 <strong>{remaining}</strong>
          </span>
        )}
      </div>

      {nothingToday ? (
        <section className={styles.doneBox}>
          <Stamp size="large" />
          <p className={styles.doneText}>오늘 분량 완료</p>
          {ahead && (
            <Button tone="primary" block onClick={() => navigate(`/study/${ahead.level}/${ahead.chapter}`)}>
              다음 장 미리 하기 ({levelName(ahead.level)} {ahead.chapter}장)
            </Button>
          )}
        </section>
      ) : (
        <Button tone="primary" block onClick={() => navigate('/study')}>
          {!settings.f5_srs && progress && progress.round_size > 0 ? '이어서 학습' : '오늘 학습 시작'}
        </Button>
      )}

      {settings.f12_stats && settings.f5_srs && <WeekChart forecast={weekForecast(cards.values(), now)} />}

      {settings.f12_stats && (
        <section className={styles.block} aria-label="전체 진도">
          <h2 className={styles.blockTitle}>
            전체 진도{' '}
            <span className={styles.blockValue}>
              {known.toLocaleString('ko-KR')} / {content.byId.size.toLocaleString('ko-KR')}
            </span>
          </h2>
          <ul className={styles.levels}>
            {content.levelIds.map((l) => {
              const n = l.ids.filter((id) => isKnownOnce(cards.get(id))).length;
              return (
                <li key={l.level}>
                  <span className={styles.levelName}>{levelName(l.level)}</span>
                  <ProgressBar value={n} max={l.ids.length} label={`${levelName(l.level)} 진도`} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function WeekChart({ forecast }: { forecast: { date: string; count: number; isToday: boolean }[] }) {
  const max = Math.max(1, ...forecast.map((d) => d.count));
  return (
    <section className={styles.block} aria-label="이번 주 복습 예정">
      <h2 className={styles.blockTitle}>이번 주 복습 예정</h2>
      <ol className={styles.week}>
        {forecast.map((d, i) => (
          <li key={d.date} className={d.isToday ? styles.today : undefined} aria-label={`${WEEKDAYS[i]}요일 ${d.count}장`}>
            <span className={styles.weekCount}>{d.count > 0 ? d.count : ''}</span>
            <span className={styles.weekBar} style={{ height: `${(d.count / max) * 100}%` }} />
            <span className={styles.weekDay}>{WEEKDAYS[i]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
