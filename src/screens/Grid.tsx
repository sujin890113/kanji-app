import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { ScreenShell, shellStyles } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { GridIcon, SearchIcon } from '../components/icons';
import { GRID_COLOR, GRID_LABEL } from '../components/status';
import { levelName, type Content } from '../content/content';
import { layoutGrid, visibleRows } from '../domain/gridLayout';
import { GRID_STATES, type GridState } from '../domain/stats';
import { useStudyRecords, type StudyRecords } from '../db/useStudyRecords';
import styles from './Grid.module.css';

type Filter = 'all' | Exclude<GridState, 'new'> | 'favorite';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'learning', label: '학습 중' },
  { value: 'vague', label: '애매' },
  { value: 'know', label: '알고있음' },
  { value: 'graduated', label: '졸업' },
  { value: 'favorite', label: '즐겨찾기' },
];

const HEADER_HEIGHT = 48;
const OVERSCAN = 600;
/** 두 손가락 거리 비율이 이만큼 바뀌면 보기를 바꾼다 */
const PINCH_IN = 0.75;
const PINCH_OUT = 1.33;

/** 상세 화면에 다녀와도 보던 자리·보기를 유지한다 (앱을 다시 열면 처음부터) */
const memory = { filter: 'all' as Filter, overview: false, scrollY: 0 };

/** S6 한자 격자 */
export function Grid() {
  const [overview, setOverview] = useState(memory.overview);
  const toggle = (next: boolean) => {
    memory.overview = next;
    setOverview(next);
  };
  return (
    <ScreenShell
      title="격자"
      actions={
        <>
          <button
            type="button"
            className={shellStyles.iconButton}
            aria-pressed={overview}
            aria-label={overview ? '한자 보기 (한 줄 8칸)' : '전체 보기 (한 줄 16칸)'}
            onClick={() => toggle(!overview)}
          >
            <GridIcon />
          </button>
          <Link to="/search" className={shellStyles.iconButton} aria-label="검색">
            <SearchIcon />
          </Link>
        </>
      }
    >
      <ContentGate>{(content) => <GridBody content={content} overview={overview} onOverview={toggle} />}</ContentGate>
    </ScreenShell>
  );
}

function GridBody({ content, overview, onOverview }: { content: Content; overview: boolean; onOverview: (v: boolean) => void }) {
  const records = useStudyRecords();
  const [filter, setFilterState] = useState<Filter>(memory.filter);
  const setFilter = (f: Filter) => {
    memory.filter = f;
    setFilterState(f);
  };

  if (!records) return <p className={styles.muted}>기록을 불러오는 중…</p>;

  const match = (id: string): boolean => {
    if (filter === 'all') return true;
    if (filter === 'favorite') return records.cards.get(id)?.favorite ?? false;
    return records.stateOf(id) === filter;
  };
  const sections = content.levelIds.map((l) => ({ level: l.level, ids: filter === 'all' ? l.ids : l.ids.filter(match) }));
  const total = sections.reduce((n, s) => n + s.ids.length, 0);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="상태로 거르기">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              className={filter === f.value ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              onClick={() => setFilter(f.value)}
            >
              {f.value !== 'all' && f.value !== 'favorite' && (
                <span className={styles.swatch} style={{ background: GRID_COLOR[f.value] }} aria-hidden="true" />
              )}
              {f.label}
            </button>
          ))}
        </div>
        <Legend records={records} ids={content.levelIds.flatMap((l) => l.ids)} />
      </div>
      {total === 0 ? (
        <p className={styles.muted}>해당하는 한자가 없습니다.</p>
      ) : (
        <VirtualGrid key={filter} sections={sections} records={records} overview={overview} onOverview={onOverview} />
      )}
    </>
  );
}

/** 상태별 색과 한자 수 (전체 보기에서는 글자가 없으므로 색의 뜻을 여기서 읽는다) */
function Legend({ records, ids }: { records: StudyRecords; ids: readonly string[] }) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(GRID_STATES.map((s) => [s, 0])) as Record<GridState, number>;
    for (const id of ids) c[records.stateOf(id)] += 1;
    return c;
  }, [records, ids]);
  return (
    <ul className={styles.legend} aria-label="칸 색 안내">
      {GRID_STATES.map((s) => (
        <li key={s}>
          <span className={styles.swatch} style={{ background: GRID_COLOR[s] }} aria-hidden="true" />
          {GRID_LABEL[s]} <span className={styles.legendNo}>{counts[s].toLocaleString('ko-KR')}</span>
        </li>
      ))}
    </ul>
  );
}

interface GridProps {
  sections: { level: number; ids: readonly string[] }[];
  records: StudyRecords;
  overview: boolean;
  onOverview: (v: boolean) => void;
}

/** 화면에 보이는 줄만 그리는 격자. 창(window) 스크롤을 따른다 */
function VirtualGrid({ sections, records, overview, onOverview }: GridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState({ top: 0, bottom: 0 });
  const cols = overview ? 16 : 8;
  const cell = width > 0 ? width / cols : 0;
  const layout = useMemo(() => layoutGrid(sections, cols, HEADER_HEIGHT, cell), [sections, cols, cell]);

  // 폭 측정
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 보이는 범위 : 격자 맨 위 기준 좌표
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const top = -el.getBoundingClientRect().top;
      setView({ top, bottom: top + window.innerHeight });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [layout]);

  // 다녀온 자리로 돌아가기, 떠날 때 자리 기억
  useEffect(() => {
    if (width > 0 && memory.scrollY > 0) window.scrollTo(0, memory.scrollY);
    // 폭을 처음 잰 뒤 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width > 0]);
  useEffect(() => {
    const save = () => (memory.scrollY = window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  // 두 손가락 줄이기 → 전체 보기(16칸), 벌리기 → 한자 보기(8칸)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<number | null>(null);
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchStart.current = distance();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size !== 2 || pinchStart.current === null || pinchStart.current === 0) return;
    const ratio = distance() / pinchStart.current;
    if (ratio < PINCH_IN && !overview) {
      onOverview(true);
      pinchStart.current = null;
    } else if (ratio > PINCH_OUT && overview) {
      onOverview(false);
      pinchStart.current = null;
    }
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const [start, end] = cell > 0 ? visibleRows(layout.rows, view.top, view.bottom, OVERSCAN) : [0, 0];

  return (
    <div
      ref={ref}
      className={overview ? `${styles.grid} ${styles.overview}` : styles.grid}
      style={{ height: layout.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      data-rows={layout.rows.length}
    >
      {layout.rows.slice(start, end).map((row) =>
        row.kind === 'header' ? (
          <h2 key={row.key} className={styles.levelHeader} style={{ transform: `translateY(${row.top}px)`, height: row.height }}>
            {levelName(row.level)} <span className={styles.levelCount}>{row.count.toLocaleString('ko-KR')}자</span>
          </h2>
        ) : (
          <div key={row.key} className={styles.row} style={{ transform: `translateY(${row.top}px)`, height: row.height }}>
            {row.ids.map((id) => {
              const state = records.stateOf(id);
              return (
                <Link
                  key={id}
                  to={`/kanji/${encodeURIComponent(id)}`}
                  className={styles.cell}
                  style={{ width: cell, background: GRID_COLOR[state] }}
                  data-state={state}
                  aria-label={`${id} ${GRID_LABEL[state]}`}
                >
                  {!overview && (
                    <span lang="ja" className={styles.kanji} aria-hidden="true">
                      {id}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}
