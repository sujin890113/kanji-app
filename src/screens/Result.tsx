import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { levelName } from '../content/content';
import type { SessionCounts } from '../domain/session';
import type { Rating } from '../domain/types';
import styles from './Result.module.css';

/** 학습 카드 화면이 넘겨주는 세션 결과 */
export interface ResultState {
  /** 머리 표시 : 'N5 · 1장 · 2회독', '오늘 학습' 등 */
  where: string;
  mode: 'round' | 'retry' | 'srs';
  counts: SessionCounts;
  startedAt: number;
  endedAt: number;
  items: { id: string; rating: Rating }[];
  roundCompleted: boolean;
  /** 이번 세션의 회독 번호 (회독 방식) */
  roundNo: number;
  /** 이번 세션에서 완료한 장 */
  completed: { level: number; chapter: number }[];
  continueTo: string;
  continueLabel: string;
  /** [공부하겠음만 다시]로 갈 장 주소. 간격 반복에서는 같은 세션 안에서 다시 나오므로 null */
  retryTo: string | null;
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
  return <ContentGate>{() => <ResultView state={state} />}</ContentGate>;
}

function ResultView({ state }: { state: ResultState }) {
  const navigate = useNavigate();
  const { counts, items } = state;
  const total = items.length;
  const seconds = Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000));
  const studyIds = [...new Set(items.filter((i) => i.rating === 'study').map((i) => i.id))];
  // 같은 한자를 여러 번 판정했으면 마지막 판정으로 칸을 칠한다
  const last = new Map(items.map((i) => [i.id, i.rating]));

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.where}>
          {state.where}
        </p>
        <h1 className={styles.title}>
          {total}자 · {formatDuration(seconds)}
        </h1>
      </header>

      {state.completed.length > 0 ? (
        <section className={styles.complete}>
          <Stamp size="large" animate />
          <p className={styles.completeText}>
            {state.completed.map((c) => `${levelName(c.level)} ${c.chapter}장`).join(', ')} 완료
          </p>
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
        {state.retryTo && (
          <Button
            block
            tone="study"
            disabled={studyIds.length === 0}
            onClick={() => navigate(state.retryTo!, { replace: true, state: { retryIds: studyIds } })}
          >
            공부하겠음만 다시{studyIds.length ? ` (${studyIds.length})` : ''}
          </Button>
        )}
        <Button block tone="primary" onClick={() => navigate(state.continueTo, { replace: true })}>
          {state.continueLabel}
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
