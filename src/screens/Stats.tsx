import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ScreenShell } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { GRID_COLOR, GRID_LABEL } from '../components/status';
import { levelName, type Content } from '../content/content';
import { dateKey } from '../domain/session';
import {
  GRID_STATES,
  calendarWeeks,
  countStates,
  dailyRatings,
  formatDuration,
  ratingShares,
  streakDays,
  topStudied,
  totalSeconds,
  type CalendarDay,
  type DayRatings,
} from '../domain/stats';
import { useStudyRecords, type StudyRecords } from '../db/useStudyRecords';
import { useSettings } from '../settings/useSettings';
import styles from './Stats.module.css';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const dayFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' });
const fmt = (n: number) => n.toLocaleString('ko-KR');
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
/** 'YYYY-MM-DD' → 'n월 n일' */
const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
};

/** S7 통계 (F12) */
export function Stats() {
  const [settings] = useSettings();
  return (
    <ScreenShell title="통계">
      {settings.f12_stats ? (
        <ContentGate>{(content) => <StatsBody content={content} />}</ContentGate>
      ) : (
        <p className={styles.muted}>
          학습 통계가 꺼져 있습니다. <Link to="/settings">설정</Link>에서 켤 수 있습니다.
        </p>
      )}
    </ScreenShell>
  );
}

function StatsBody({ content }: { content: Content }) {
  const records = useStudyRecords();
  if (!records) return <p className={styles.muted}>기록을 불러오는 중…</p>;
  return (
    <>
      <Summary content={content} records={records} />
      <Calendar records={records} />
      <LevelProgress content={content} records={records} />
      <DailyTrend records={records} />
      <Missed content={content} records={records} />
    </>
  );
}

/** 요약 카드 4개 */
function Summary({ content, records }: { content: Content; records: StudyRecords }) {
  const [settings] = useSettings();
  const now = Date.now();
  const streak = streakDays(records.daily.filter((d) => d.reviewed > 0).map((d) => d.date), now);
  const today = records.daily.find((d) => d.date === dateKey(now))?.reviewed ?? 0;
  let known = 0;
  for (const id of content.byId.keys()) {
    const s = records.stateOf(id);
    if (s === 'know' || s === 'graduated') known += 1;
  }
  return (
    <ul className={styles.summary} aria-label="요약">
      <li className={styles.tile}>
        <span className={styles.tileLabel}>연속 학습일</span>
        <span className={`${styles.tileValue} ${styles.streak}`}>{fmt(streak)}일</span>
      </li>
      <li className={styles.tile}>
        <span className={styles.tileLabel}>누적 학습 시간</span>
        <span className={styles.tileValue}>
          {/* '16시간 42분' : 숫자는 크게, 단위는 작게 (한 줄에 들어가게) */}
          {[...formatDuration(totalSeconds(records.daily)).matchAll(/(\d+)(\D+?)(?= |$)/g)].map((m) => (
            <span key={m[2]}>
              {m[1]}
              <span className={styles.tileSub}>{m[2]} </span>
            </span>
          ))}
        </span>
      </li>
      <li className={styles.tile}>
        <span className={styles.tileLabel}>알고있음 이상</span>
        <span className={styles.tileValue}>
          {fmt(known)}
          <span className={styles.tileSub}> / {fmt(content.byId.size)}자</span>
        </span>
      </li>
      <li className={styles.tile}>
        <span className={styles.tileLabel}>오늘 학습량</span>
        <span className={styles.tileValue}>
          {fmt(today)}
          <span className={styles.tileSub}> / 목표 {settings.daily_goal}</span>
        </span>
      </li>
    </ul>
  );
}

/** 최근 12주 일별 학습량 (하루 목표 대비 농도) */
function Calendar({ records }: { records: StudyRecords }) {
  const [settings] = useSettings();
  const weeks = useMemo(() => calendarWeeks(records.daily, Date.now(), settings.daily_goal), [records.daily, settings.daily_goal]);
  const days = weeks.flat().filter((d) => !d.future);
  const active = days.filter((d) => d.count > 0).length;
  const title = (d: CalendarDay) => `${dayLabel(d.date)} ${d.count > 0 ? `${fmt(d.count)}장` : '학습 없음'}`;
  return (
    <section className={styles.block} aria-label="최근 12주 학습">
      <h2 className={styles.blockTitle}>
        최근 12주 <span className={styles.blockValue}>{active}일 학습</span>
      </h2>
      <div className={styles.calendar}>
        <ol className={styles.weekdays} aria-hidden="true">
          {WEEKDAYS.map((w, i) => (
            <li key={w}>{i % 2 === 0 ? w : ''}</li>
          ))}
        </ol>
        <ol className={styles.weeks}>
          {weeks.map((wk) => (
            <li key={wk[0].date}>
              <ol className={styles.days}>
                {wk.map((d) => (
                  <li
                    key={d.date}
                    className={d.future ? `${styles.day} ${styles.future}` : styles.day}
                    style={d.future ? undefined : { background: `var(--heat-${d.level})` }}
                    title={d.future ? undefined : title(d)}
                    aria-label={d.future ? undefined : title(d)}
                    aria-hidden={d.future ? true : undefined}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.heatLegend} aria-hidden="true">
        <span>적음</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={styles.heatSwatch} style={{ background: `var(--heat-${l})` }} />
        ))}
        <span>많음 (하루 목표 {settings.daily_goal}장 기준)</span>
      </div>
    </section>
  );
}

/** 급수별 상태 비율 누적 막대 */
function LevelProgress({ content, records }: { content: Content; records: StudyRecords }) {
  return (
    <section className={styles.block} aria-label="급수별 진도">
      <h2 className={styles.blockTitle}>급수별 진도</h2>
      <ul className={styles.levels}>
        {content.levelIds.map((l) => {
          const c = countStates(l.ids, records.stateOf);
          const done = c.know + c.graduated;
          const parts = GRID_STATES.filter((s) => s !== 'new' && c[s] > 0);
          return (
            <li key={l.level} className={styles.levelRow}>
              <span className={styles.levelName}>{levelName(l.level)}</span>
              <span
                className={styles.stack}
                role="img"
                aria-label={`${levelName(l.level)} ${GRID_STATES.map((s) => `${GRID_LABEL[s]} ${c[s]}`).join(', ')}`}
              >
                {parts.map((s) => (
                  <span key={s} className={styles.seg} style={{ flexGrow: c[s], background: GRID_COLOR[s] }} />
                ))}
                {c.new > 0 && <span className={styles.seg} style={{ flexGrow: c.new, background: GRID_COLOR.new }} />}
              </span>
              <span className={styles.levelPct}>{pct(done, l.ids.length)}%</span>
            </li>
          );
        })}
      </ul>
      <ul className={styles.legend} aria-hidden="true">
        {GRID_STATES.map((s) => (
          <li key={s}>
            <span className={styles.swatch} style={{ background: GRID_COLOR[s] }} />
            {GRID_LABEL[s]}
          </li>
        ))}
      </ul>
    </section>
  );
}

const RATING_PARTS = [
  { key: 'study', label: '공부하겠음', color: 'var(--grade-study)' },
  { key: 'vague', label: '애매함', color: 'var(--grade-vague)' },
  { key: 'know', label: '알고있음', color: 'var(--grade-know)' },
] as const;

/** 최근 30일 판정 수 막대와 전체 판정 비율 */
function DailyTrend({ records }: { records: StudyRecords }) {
  const days = useMemo(() => dailyRatings(records.logs, Date.now()), [records.logs]);
  const shares = useMemo(() => ratingShares(records.logs), [records.logs]);
  const sum = (d: DayRatings) => d.study + d.vague + d.know;
  const max = Math.max(1, ...days.map(sum));
  const total30 = days.reduce((n, d) => n + sum(d), 0);
  const label = (d: DayRatings) =>
    `${dayLabel(d.date)} ${sum(d) > 0 ? `${fmt(sum(d))}장 (공부하겠음 ${d.study}, 애매함 ${d.vague}, 알고있음 ${d.know})` : '판정 없음'}`;
  return (
    <section className={styles.block} aria-label="최근 30일 판정">
      <h2 className={styles.blockTitle}>
        최근 30일 <span className={styles.blockValue}>{fmt(total30)}장</span>
      </h2>
      <ol className={styles.bars}>
        {days.map((d) => (
          <li key={d.date} className={styles.barSlot} title={label(d)} aria-label={label(d)}>
            <span className={styles.bar} style={{ height: `${(sum(d) / max) * 100}%` }}>
              {RATING_PARTS.filter((p) => d[p.key] > 0).map((p) => (
                <span key={p.key} className={styles.barSeg} style={{ flexGrow: d[p.key], background: p.color }} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.axis} aria-hidden="true">
        <span>{dayLabel(days[0].date)}</span>
        <span>오늘</span>
      </div>
      <ul className={styles.legend}>
        {RATING_PARTS.map((p) => (
          <li key={p.key}>
            <span className={styles.swatch} style={{ background: p.color }} aria-hidden="true" />
            {p.label} <strong className={styles.legendNo}>{pct(shares[p.key], shares.total)}%</strong>
          </li>
        ))}
      </ul>
      <p className={styles.note}>비율은 지금까지의 판정 {fmt(shares.total)}회 기준입니다.</p>
    </section>
  );
}

/** 자주 틀리는 한자 : 공부하겠음 횟수 상위 30자 */
function Missed({ content, records }: { content: Content; records: StudyRecords }) {
  const navigate = useNavigate();
  const order = useMemo(() => new Map(content.levelIds.flatMap((l) => l.ids).map((id, i) => [id, i])), [content]);
  const top = useMemo(() => topStudied(records.cards.values(), order, 30), [records.cards, order]);
  return (
    <section className={styles.block} aria-label="자주 틀리는 한자">
      <h2 className={styles.blockTitle}>
        자주 틀리는 한자 <span className={styles.blockValue}>{top.length}자</span>
      </h2>
      {top.length === 0 ? (
        <p className={styles.muted}>아직 '공부하겠음'으로 판정한 한자가 없습니다.</p>
      ) : (
        <>
          <ol className={styles.missed}>
            {top.map((t) => (
              <li key={t.id}>
                <Link to={`/kanji/${encodeURIComponent(t.id)}`} className={styles.missedCell} aria-label={`${t.id} 공부하겠음 ${t.marks}회`}>
                  <span lang="ja" className={styles.missedKanji} aria-hidden="true">
                    {t.id}
                  </span>
                  <span className={styles.missedNo} aria-hidden="true">
                    {t.marks}회
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <Button
            tone="primary"
            block
            onClick={() => navigate('/study/list', { state: { retryIds: top.map((t) => t.id), label: '자주 틀리는 한자' } })}
          >
            이 한자만 학습
          </Button>
        </>
      )}
    </section>
  );
}
