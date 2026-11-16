import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ContentGate } from '../components/ContentGate';
import { GradeButtons } from '../components/GradeButtons';
import { ProgressBar } from '../components/ProgressBar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { CloseIcon, StarIcon, UndoIcon } from '../components/icons';
import { getChapter, levelName, type Content, type Kanji } from '../content/content';
import { chapterKey, currentChapter, nextChapter, unlockedChapters } from '../domain/progress';
import { newCard, roundDone, roundNumber, shuffle } from '../domain/scheduler';
import { addCount, emptyCounts, formatKun, sessionLimit, type SessionCounts } from '../domain/session';
import type { CardState, ChapterProgress, Rating } from '../domain/types';
import {
  finishSession,
  getAllChapters,
  openChapter,
  recordGrade,
  startSession,
  toggleFavorite,
  undoGrade,
  type UndoSnapshot,
} from '../db/study';
import { useLive } from '../db/useLive';
import { useSettings } from '../settings/useSettings';
import type { ResultState } from './Result';
import styles from './Study.module.css';

/** S3 학습 카드 (탭 숨김). /study 는 지금 학습할 장으로, /study/:level/:chapter 는 그 장으로 */
export function Study() {
  return <ContentGate>{(content) => <StudyRoute content={content} />}</ContentGate>;
}

function StudyRoute({ content }: { content: Content }) {
  const { level, chapter } = useParams();
  const location = useLocation();
  if (level === undefined || chapter === undefined) return <ResolveCurrent content={content} />;
  const retryIds = (location.state as { retryIds?: string[] } | null)?.retryIds;
  return (
    <StudySession
      key={location.key}
      content={content}
      level={Number(level)}
      chapter={Number(chapter)}
      retryIds={retryIds}
    />
  );
}

function ResolveCurrent({ content }: { content: Content }) {
  const [settings] = useSettings();
  const rows = useLive(getAllChapters);
  if (!rows) return null;
  const done = new Set(rows.filter((r) => r.completed_at !== null).map((r) => chapterKey(r.level, r.chapter)));
  const cur = currentChapter(content.outline, done, settings.level_lock);
  return <Navigate replace to={cur ? `/study/${cur.level}/${cur.chapter}` : '/levels'} />;
}

type RevealState = { ko: boolean; reading: boolean };

interface UiSnapshot {
  progress: ChapterProgress | null;
  queue: string[];
  counts: SessionCounts;
  items: { id: string; rating: Rating }[];
  card: CardState | undefined;
}

interface Props {
  content: Content;
  level: number;
  chapter: number;
  /** [공부하겠음만 다시] 연습 : 회독 진행과 별도로 이 한자들만 */
  retryIds?: string[];
}

function StudySession({ content, level, chapter, retryIds }: Props) {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const mode: 'round' | 'retry' = retryIds ? 'retry' : 'round';
  const ch = getChapter(content, level, chapter);

  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [cards, setCards] = useState<Map<string, CardState>>(new Map());
  const [counts, setCounts] = useState<SessionCounts>(emptyCounts);
  const [items, setItems] = useState<{ id: string; rating: Rating }[]>([]);
  const [reveal, setReveal] = useState<RevealState>(() => initialReveal(settings.auto_reveal));
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ snapshot: UndoSnapshot; ui: UiSnapshot; id: string } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionId = useRef<number | null>(null);
  const startedAt = useRef(Date.now());

  // 장 열기 : 진행 기록이 있으면 같은 회독의 남은 한자부터 이어진다
  useEffect(() => {
    if (!ch) return;
    let cancelled = false;
    void (async () => {
      // 단계 잠금 (주소로 바로 들어온 경우도 막는다)
      const rows = await getAllChapters();
      const done = new Set(rows.filter((r) => r.completed_at !== null).map((r) => chapterKey(r.level, r.chapter)));
      if (!unlockedChapters(content.outline, done, settings.level_lock).has(chapterKey(level, chapter))) {
        if (!cancelled) setLocked(true);
        return;
      }
      const { progress: p, cards: c } = await openChapter(level, chapter, ch.ids, settings.card_order);
      if (cancelled) return;
      setProgress(p);
      setCards(c);
      if (retryIds) {
        const valid = retryIds.filter((id) => ch.ids.includes(id));
        setQueue(settings.card_order === 'shuffle' ? shuffle(valid, Math.random) : ch.ids.filter((id) => valid.includes(id)));
      }
      shownAt.current = Date.now();
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // 세션 시작 시 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentId = mode === 'round' ? progress?.round_queue[0] : queue[0];
  const kanji = currentId ? content.byId.get(currentId) : undefined;
  const limit = sessionLimit(settings.session_size);

  const resetForNextCard = () => {
    setReveal(initialReveal(settings.auto_reveal));
    shownAt.current = Date.now();
  };

  const finish = async (finalCounts: SessionCounts, finalItems: typeof items, flags: { round: boolean; chapter: boolean }, p: ChapterProgress | null) => {
    if (sessionId.current !== null) await finishSession(sessionId.current, finalCounts);
    const state: ResultState = {
      level,
      chapter,
      mode,
      counts: finalCounts,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      items: finalItems,
      roundCompleted: flags.round,
      chapterCompleted: flags.chapter,
      roundNo: p ? (flags.round ? p.pass_count : roundNumber(p)) : 0,
    };
    navigate('/result', { replace: true, state });
  };

  const grade = async (rating: Rating) => {
    if (busy || !currentId) return;
    setBusy(true);
    try {
      sessionId.current ??= await startSession(level, chapter);
      const res = await recordGrade({
        kanjiId: currentId,
        rating,
        elapsedMs: Date.now() - shownAt.current,
        sessionId: sessionId.current,
        round: mode === 'round' && progress && ch ? { progress, ids: ch.ids, order: settings.card_order } : null,
      });
      if (settings.haptics) navigator.vibrate?.(15);

      const ui: UiSnapshot = { progress, queue, counts, items, card: cards.get(currentId) };
      const nextCounts = addCount(counts, rating);
      const nextItems = [...items, { id: currentId, rating }];
      const nextQueue = mode === 'retry' ? queue.slice(1) : queue;
      setCards(new Map(cards).set(currentId, res.card));
      setCounts(nextCounts);
      setItems(nextItems);
      setQueue(nextQueue);
      if (res.progress) setProgress(res.progress);

      const finished =
        mode === 'round' ? res.roundCompleted || nextItems.length >= limit : nextQueue.length === 0;
      if (finished) {
        await finish(nextCounts, nextItems, { round: res.roundCompleted, chapter: res.chapterCompleted }, res.progress);
        return;
      }
      setUndo({ snapshot: res.undo, ui, id: currentId });
      resetForNextCard();
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async () => {
    if (!undo || busy) return;
    setBusy(true);
    try {
      await undoGrade(undo.snapshot, undo.id);
      const { ui } = undo;
      setProgress(ui.progress);
      setQueue(ui.queue);
      setCounts(ui.counts);
      setItems(ui.items);
      const restored = new Map(cards);
      if (ui.card) restored.set(undo.id, ui.card);
      else restored.delete(undo.id);
      setCards(restored);
      setUndo(null);
      resetForNextCard();
    } finally {
      setBusy(false);
    }
  };

  const onFavorite = async () => {
    if (!currentId) return;
    const fav = await toggleFavorite(currentId);
    const base = cards.get(currentId) ?? newCard(currentId);
    setCards(new Map(cards).set(currentId, { ...base, favorite: fav }));
  };

  const exit = async () => {
    setConfirmExit(false);
    if (items.length === 0) navigate('/levels');
    else await finish(counts, items, { round: false, chapter: false }, progress);
  };

  if (!ch || locked) return <Navigate replace to="/levels" />;
  if (!loaded || !progress) return <p className={styles.loading}>장을 여는 중…</p>;

  // 완료한 장을 연 경우
  if (mode === 'round' && progress.completed_at !== null) {
    return <CompletedChapter content={content} progress={progress} />;
  }
  if (!kanji) return <Navigate replace to="/levels" />;

  const total = mode === 'round' ? progress.round_size : items.length + queue.length;
  const done = mode === 'round' ? roundDone(progress) : items.length;
  const roundLabel = mode === 'round' ? `${roundNumber(progress)}회독` : '다시';
  const title = `${levelName(level)} · ${chapter}장 · ${roundLabel}`;
  const anyOpen = reveal.ko || reveal.reading;
  const favorite = cards.get(kanji.id)?.favorite ?? false;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="세션 끝내기" onClick={() => setConfirmExit(true)}>
          <CloseIcon />
        </button>
        <p className={styles.title}>
          {title} · <span className={styles.count}>{done}/{total}</span>
        </p>
        <button type="button" className={styles.iconButton} aria-label="직전 판정 되돌리기" disabled={!undo || busy} onClick={() => void doUndo()}>
          <UndoIcon />
        </button>
      </header>
      <ProgressBar value={done} max={total} label="이번 회독 진행" />

      <section
        className={styles.card}
        onClick={() => setReveal(anyOpen && reveal.ko && reveal.reading ? { ko: false, reading: false } : { ko: true, reading: true })}
        aria-label="학습 카드. 누르면 전부 펼치거나 접습니다"
      >
        <button
          type="button"
          className={`${styles.star} ${favorite ? styles.starOn : ''}`}
          aria-label={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-pressed={favorite}
          onClick={(e) => {
            e.stopPropagation();
            void onFavorite();
          }}
        >
          <StarIcon filled={favorite} />
        </button>

        <div className={styles.cardBody}>
          <div className={`${styles.kanji} ${anyOpen ? styles.kanjiSmall : ''}`} lang="ja">
            {kanji.id}
          </div>
          {anyOpen && <Answer kanji={kanji} reveal={reveal} />}
        </div>

        <div className={styles.chips}>
          <RevealChip label="한국어" pressed={reveal.ko} onToggle={() => setReveal({ ...reveal, ko: !reveal.ko })} />
          <RevealChip label="읽기" pressed={reveal.reading} onToggle={() => setReveal({ ...reveal, reading: !reveal.reading })} />
        </div>
      </section>

      <footer className={styles.footer}>
        {/* M2 : 판정 2단계. F6(애매함)은 M3에서 설정과 연결 */}
        <GradeButtons threeGrade={false} longPress={settings.longpress_graduate} disabled={busy} onGrade={(r) => void grade(r)} />
      </footer>

      <Sheet open={confirmExit} title="세션을 끝낼까요?" onClose={() => setConfirmExit(false)}>
        <p className={styles.sheetText}>
          지금까지의 판정은 저장되어 있습니다. 다음에 이 장을 열면 같은 회독의 남은 한자부터 이어집니다.
        </p>
        <div className={styles.sheetActions}>
          <Button tone="primary" block onClick={() => setConfirmExit(false)}>
            계속 학습
          </Button>
          <Button block onClick={() => void exit()}>
            끝내기
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function initialReveal(auto: 'none' | 'ko' | 'reading' | 'all'): RevealState {
  return { ko: auto === 'ko' || auto === 'all', reading: auto === 'reading' || auto === 'all' };
}

function RevealChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${pressed ? styles.chipOn : ''}`}
      aria-pressed={pressed}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {label}
    </button>
  );
}

/** 답 영역 (M2 기본형. F1·F2 등 세부 구역은 M4) */
function Answer({ kanji, reveal }: { kanji: Kanji; reveal: RevealState }) {
  return (
    <div className={styles.answer}>
      {reveal.ko && (
        <div className={`${styles.row} ${styles.rowKo}`}>
          <span className={styles.rowLabel}>한</span>
          <div>
            {kanji.kokuji || !kanji.ko_main ? (
              <span className={styles.kokuji}>일본 고유 한자</span>
            ) : (
              <span className={styles.koMain}>{`${kanji.ko_main.hun} ${kanji.ko_main.eum}`.trim()}</span>
            )}
            {kanji.meaning_ko && <p className={styles.meaning}>{kanji.meaning_ko}</p>}
          </div>
        </div>
      )}
      {reveal.reading && (
        <>
          <div className={`${styles.row} ${styles.rowOn}`}>
            <span className={styles.rowLabel} lang="ja">音</span>
            <span className={styles.reading} lang="ja">
              {kanji.on.length ? kanji.on.join('・') : '—'}
            </span>
          </div>
          <div className={`${styles.row} ${styles.rowKun}`}>
            <span className={styles.rowLabel} lang="ja">訓</span>
            <span className={styles.reading} lang="ja">
              {kanji.kun.length ? kanji.kun.map(formatKun).join('・') : '—'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function CompletedChapter({ content, progress }: { content: Content; progress: ChapterProgress }) {
  const navigate = useNavigate();
  const next = useMemo(() => nextChapter(content.outline, progress.level, progress.chapter), [content, progress]);
  return (
    <div className={styles.completed}>
      <Stamp size="large" />
      <p className={styles.completedTitle}>
        {levelName(progress.level)} {progress.chapter}장은 완료한 장입니다
      </p>
      <p className={styles.sheetText}>{progress.pass_count}회독으로 완료했습니다. 다시 공부하려면 단계 지도에서 [처음부터 다시]를 누르세요.</p>
      <div className={styles.sheetActions}>
        {next && (
          <Button tone="primary" block onClick={() => navigate(`/study/${next.level}/${next.chapter}`, { replace: true })}>
            다음 장 ({levelName(next.level)} {next.chapter}장)
          </Button>
        )}
        <Button block onClick={() => navigate('/levels', { replace: true })}>
          단계 지도로
        </Button>
      </div>
    </div>
  );
}
