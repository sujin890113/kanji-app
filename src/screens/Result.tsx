import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { levelName, type Content } from '../content/content';
import { nextChapter } from '../domain/progress';
import type { SessionCounts } from '../domain/session';
import type { Rating } from '../domain/types';
import styles from './Result.module.css';

/** 학습 카드 화면이 넘겨주는 세션 결과 */
export interface ResultState {
  level: number;
  chapter: number;
  mode: 'round' | 'retry';
  counts: SessionCounts;
  startedAt: number;
  endedAt: number;
  items: { id: string; rating: Rating }[];
  roundCompleted: boolean;
  chapterCompleted: boolean;
  /** 이번 세션의 회독 번호 */
  roundNo: number;
}

const RATING_COLOR: Record<Rating, string> = {
  study: 'var(--cell-learning)',
  vague: 'var(--cell-vague)',
  know: 'var(--cell-know)',
  graduate: 'var(--cell-graduated)',
};

const RATING_LABEL: Record<Rating, string> = {
  study: '공부하겠음',
  vague: '애매함',
  know: '알고있음',
  graduate: '졸업',
};

/** S4 세션 결과 (탭 숨김) */
export function Result() {
  const location = useLocation();
  const state = location.state as ResultState | null;
  if (!state) return <Navigate replace to="/levels" />;
  return <ContentGate>{(content) => <ResultView state={state} content={content} />}</ContentGate>;
}

function ResultView({ state, content }: { state: ResultState; content: Content }) {
  const navigate = useNavigate();
  const { counts, items } = state;
  const total = items.length;
  const seconds = Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000));
  const studyIds = [...new Set(items.filter((i) => i.rating === 'study').map((i) => i.id))];
  // 같은 한자를 여러 번 판정했으면 마지막 판정으로 칸을 칠한다
  const last = new Map(items.map((i) => [i.id, i.rating]));
  const next = nextChapter(content.outline, state.level, state.chapter);

  const continueTo = state.chapterCompleted && next ? `/study/${next.level}/${next.chapter}` : `/study/${state.level}/${state.chapter}`;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.where}>
          {levelName(state.level)} · {state.chapter}장 · {state.mode === 'retry' ? '공부하겠음 다시' : `${state.roundNo}회독`}
        </p>
        <h1 className={styles.title}>
          {total}자 · {formatDuration(seconds)}
        </h1>
      </header>

      {state.chapterCompleted ? (
        <section className={styles.complete}>
          <Stamp size="large" animate />
          <p className={styles.completeText}>{state.chapter}장 완료</p>
        </section>
      ) : (
        state.roundCompleted && <p className={styles.note}>{state.roundNo}회독을 마쳤습니다. 남은 한자로 다음 회독이 이어집니다.</p>
      )}

      <section className={styles.block} aria-label="판정 비율">
        <div className={styles.ratio}>
          {(['study', 'vague', 'know'] as const).map((k) =>
            counts[k] > 0 ? (
              <span key={k} className={styles.ratioPart} style={{ flexGrow: counts[k], background: RATING_COLOR[k] }} />
            ) : null,
          )}
        </div>
        <ul className={styles.ratioLegend}>
          <li>
            <span className={styles.swatch} style={{ background: RATING_COLOR.study }} />
            공부하겠음 {counts.study}
          </li>
          {counts.vague > 0 && (
            <li>
              <span className={styles.swatch} style={{ background: RATING_COLOR.vague }} />
              애매함 {counts.vague}
            </li>
          )}
          <li>
            <span className={styles.swatch} style={{ background: RATING_COLOR.know }} />
            알고있음 {counts.know}
          </li>
        </ul>
      </section>

      <section className={styles.block} aria-label="이번 세션 한자">
        <ul className={styles.cells}>
          {[...last.entries()].map(([id, rating]) => (
            <li key={id}>
              <Link
                to={`/kanji/${encodeURIComponent(id)}`}
                className={styles.cell}
                style={{ background: RATING_COLOR[rating] }}
                title={RATING_LABEL[rating]}
                lang="ja"
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className={styles.actions}>
        <Button
          block
          tone="study"
          disabled={studyIds.length === 0}
          onClick={() => navigate(`/study/${state.level}/${state.chapter}`, { replace: true, state: { retryIds: studyIds } })}
        >
          공부하겠음만 다시{studyIds.length ? ` (${studyIds.length})` : ''}
        </Button>
        <Button block tone="primary" onClick={() => navigate(continueTo, { replace: true })}>
          {state.chapterCompleted && next ? `계속하기 (${levelName(next.level)} ${next.chapter}장)` : '계속하기'}
        </Button>
        <Button block onClick={() => navigate('/', { replace: true })}>
          홈으로
        </Button>
      </footer>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
