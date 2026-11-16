import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ContentGate } from '../components/ContentGate';
import { GradeButtons } from '../components/GradeButtons';
import { ProgressBar } from '../components/ProgressBar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { CloseIcon, StarIcon, UndoIcon } from '../components/icons';
import { getChapter, levelName, type Chapter, type Content, type Kanji } from '../content/content';
import { chapterKey, nextChapter, summarizeChapters } from '../domain/progress';
import { newCard, roundDone, roundNumber, shuffle } from '../domain/scheduler';
import {
  addCount,
  emptyCounts,
  formatKun,
  REQUEUE_GAP,
  requeue,
  sessionLimit,
  vagueRequeuePosition,
  type SessionCounts,
} from '../domain/session';
import { buildSrsQueue, dailyRoom } from '../domain/srs';
import type { CardState, ChapterProgress, Rating } from '../domain/types';
import {
  finishSession,
  getAllCards,
  getAllChapters,
  getToday,
  openChapter,
  recordGrade,
  startSession,
  toggleFavorite,
  undoGrade,
  type UndoSnapshot,
} from '../db/study';
import { useProgressView } from '../db/useProgress';
import { useSettings } from '../settings/useSettings';
import type { Settings } from '../settings/definitions';
import type { ResultState } from './Result';
import styles from './Study.module.css';

/**
 * S3 학습 카드 (탭 숨김)
 * - /study : 간격 반복(F5)이 켜져 있으면 오늘 학습, 꺼져 있으면 지금 학습할 장으로
 * - /study/today : 간격 반복의 오늘 학습 (복습 → 새 한자)
 * - /study/:level/:chapter : 그 장. F5 끔이면 회독, 켬이면 그 장의 복습·새 한자
 */
export function Study() {
  return <ContentGate>{(content) => <StudyRoute content={content} />}</ContentGate>;
}

function StudyRoute({ content }: { content: Content }) {
  const { level, chapter } = useParams();
  const location = useLocation();
  const [settings] = useSettings();
  const today = location.pathname.endsWith('/today');
  if (today && !settings.f5_srs) return <Navigate replace to="/study" />;
  if (!today && (level === undefined || chapter === undefined)) return <ResolveCurrent content={content} />;
  const retryIds = (location.state as { retryIds?: string[] } | null)?.retryIds;
  return (
    <StudySession
      key={location.key}
      content={content}
      scope={today ? { kind: 'today' } : { kind: 'chapter', level: Number(level), chapter: Number(chapter) }}
      retryIds={retryIds}
    />
  );
}

function ResolveCurrent({ content }: { content: Content }) {
  const [settings] = useSettings();
  const view = useProgressView(content);
  if (settings.f5_srs) return <Navigate replace to="/study/today" />;
  if (!view) return null;
  const cur = view.summary.current;
  return <Navigate replace to={cur ? `/study/${cur.level}/${cur.chapter}` : '/levels'} />;
}

type Scope = { kind: 'today' } | { kind: 'chapter'; level: number; chapter: number };
type Mode = 'round' | 'retry' | 'srs';
type RevealState = { ko: boolean; reading: boolean };

/** 되돌리기 때 화면 상태를 그대로 돌려놓기 위한 사본 */
interface UiSnapshot {
  progress: ChapterProgress | null;
  queue: string[];
  counts: SessionCounts;
  items: { id: string; rating: Rating }[];
  card: CardState | undefined;
  seen: Set<string>;
  repeated: Set<string>;
  pending: Set<string>;
  completed: { level: number; chapter: number }[];
}

interface Props {
  content: Content;
  scope: Scope;
  /** [공부하겠음만 다시] 연습 : 회독 진행과 별도로 이 한자들만 */
  retryIds?: string[];
}

function StudySession({ content, scope, retryIds }: Props) {
  const navigate = useNavigate();
  const [settings] = useSettings();
  // 세션을 여는 순간의 방식으로 고정한다 (도중에 설정을 바꾸면 다음 세션부터 적용)
  const [mode] = useState<Mode>(() => (retryIds ? 'retry' : settings.f5_srs ? 'srs' : 'round'));
  const ch = scope.kind === 'chapter' ? getChapter(content, scope.level, scope.chapter) : undefined;

  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [cards, setCards] = useState<Map<string, CardState>>(new Map());
  const [counts, setCounts] = useState<SessionCounts>(emptyCounts);
  const [items, setItems] = useState<{ id: string; rating: Rating }[]>([]);
  /** 이번 세션에서 한 번 이상 판정한 한자 */
  const [seen, setSeen] = useState<Set<string>>(new Set());
  /** 애매함으로 이미 한 번 더 낸 한자 */
  const [repeated, setRepeated] = useState<Set<string>>(new Set());
  /** 다시 내기로 했지만 아직 다시 판정하지 않은 한자 */
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<{ level: number; chapter: number }[]>([]);
  const [reveal, setReveal] = useState<RevealState>(() => initialReveal(settings.auto_reveal));
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ snapshot: UndoSnapshot; ui: UiSnapshot; id: string } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionId = useRef<number | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (scope.kind === 'chapter' && !ch) return;
    let cancelled = false;
    void (async () => {
      const [rows, allCards, today] = await Promise.all([getAllChapters(), getAllCards(), getToday()]);
      const summary = summarizeChapters(content.chapters, content.outline, rows, allCards, settings.level_lock);
      // 단계 잠금 (주소로 바로 들어온 경우도 막는다)
      if (ch && !summary.open.has(chapterKey(ch.level, ch.chapter))) {
        if (!cancelled) setBlocked(true);
        return;
      }
      if (mode === 'srs') {
        const q = srsQueue(content, settings, summary.open, summary.completed, allCards, today, ch);
        if (cancelled) return;
        setCards(allCards);
        setQueue(q);
      } else if (ch) {
        // 회독 : 진행 기록이 있으면 같은 회독의 남은 한자부터 이어진다
        const { progress: p, cards: c } = await openChapter(ch.level, ch.chapter, ch.ids, settings.card_order);
        if (cancelled) return;
        setProgress(p);
        setCards(c);
        if (retryIds) {
          const valid = retryIds.filter((id) => ch.ids.includes(id));
          setQueue(settings.card_order === 'shuffle' ? shuffle(valid, Math.random) : ch.ids.filter((id) => valid.includes(id)));
        }
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

  const finish = async (
    final: { counts: SessionCounts; items: { id: string; rating: Rating }[]; completed: { level: number; chapter: number }[] },
    roundCompleted: boolean,
    p: ChapterProgress | null,
  ) => {
    if (sessionId.current !== null) await finishSession(sessionId.current, final.counts);
    const last = final.completed.at(-1);
    const next = last ? nextChapter(content.outline, last.level, last.chapter) : null;
    const here = ch ? `/study/${ch.level}/${ch.chapter}` : '/study/today';
    const roundNo = p ? (roundCompleted ? p.pass_count : roundNumber(p)) : 0;
    const state: ResultState = {
      where: whereLabel(mode, scope, roundNo),
      mode,
      counts: final.counts,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      items: final.items,
      roundCompleted,
      roundNo,
      completed: final.completed,
      continueTo: mode === 'srs' ? here : next ? `/study/${next.level}/${next.chapter}` : here,
      continueLabel: mode !== 'srs' && last && next ? `계속하기 (${levelName(next.level)} ${next.chapter}장)` : '계속하기',
      retryTo: mode !== 'srs' && ch ? here : null,
    };
    navigate('/result', { replace: true, state });
  };

  const grade = async (rating: Rating) => {
    if (busy || !currentId) return;
    setBusy(true);
    try {
      const firstTime = !seen.has(currentId);
      const nextSeen = new Set(seen).add(currentId);
      const nextPending = new Set(pending);
      nextPending.delete(currentId);
      const nextRepeated = new Set(repeated);
      // 애매함(F6) : 같은 세션 뒤쪽에 한 번 더. 공부하겠음(F5 켬) : 몇 장 뒤에 다시
      const vagueAgain = rating === 'vague' && !repeated.has(currentId);
      const studyAgain = mode === 'srs' && rating === 'study';
      if (vagueAgain) nextRepeated.add(currentId);
      if (vagueAgain || studyAgain) nextPending.add(currentId);

      let requeueAt: number | undefined;
      let nextQueue: string[];
      if (mode === 'round') {
        nextQueue = queue;
        if (vagueAgain && progress) {
          requeueAt = vagueRequeuePosition(progress.round_queue.length - 1, limit - nextSeen.size);
        }
      } else if (studyAgain) {
        nextQueue = requeue(queue, currentId, REQUEUE_GAP);
      } else if (vagueAgain) {
        nextQueue = requeue(queue, currentId, Number.POSITIVE_INFINITY);
      } else {
        nextQueue = queue.slice(1);
      }

      sessionId.current ??= await startSession(ch?.level ?? -1, ch?.chapter ?? 0);
      const home = mode === 'srs' ? content.chapterOf.get(currentId) : ch;
      const res = await recordGrade({
        kanjiId: currentId,
        rating,
        elapsedMs: Date.now() - shownAt.current,
        sessionId: sessionId.current,
        scheduler: mode === 'srs' ? { kind: 'srs', options: { retention: settings.srs_retention, fuzz: true } } : { kind: 'round' },
        chapter: mode === 'retry' || !home ? null : { level: home.level, chapter: home.chapter, ids: home.ids, order: settings.card_order },
        requeueAt,
      });
      if (settings.haptics) navigator.vibrate?.(15);

      const ui: UiSnapshot = { progress, queue, counts, items, card: cards.get(currentId), seen, repeated, pending, completed };
      const nextCounts = addCount(counts, rating);
      const nextItems = [...items, { id: currentId, rating }];
      const nextCompleted =
        res.chapterCompleted && res.progress ? [...completed, { level: res.progress.level, chapter: res.progress.chapter }] : completed;
      setCards(new Map(cards).set(currentId, res.card));
      setCounts(nextCounts);
      setItems(nextItems);
      setQueue(nextQueue);
      setSeen(nextSeen);
      setRepeated(nextRepeated);
      setPending(nextPending);
      setCompleted(nextCompleted);
      if (mode === 'round' && res.progress) setProgress(res.progress);

      const firstCount = firstTime ? nextSeen.size : seen.size;
      const finished =
        mode === 'round'
          ? res.roundCompleted || (firstCount >= limit && nextPending.size === 0)
          : nextQueue.length === 0;
      if (finished) {
        await finish(
          { counts: nextCounts, items: nextItems, completed: nextCompleted },
          mode === 'round' && res.roundCompleted,
          mode === 'round' ? res.progress : null,
        );
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
      setSeen(ui.seen);
      setRepeated(ui.repeated);
      setPending(ui.pending);
      setCompleted(ui.completed);
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
    if (items.length === 0) navigate(scope.kind === 'today' ? '/' : '/levels');
    else await finish({ counts, items, completed }, false, mode === 'round' ? progress : null);
  };

  if ((scope.kind === 'chapter' && !ch) || blocked) return <Navigate replace to="/levels" />;
  if (!loaded) return <p className={styles.loading}>{scope.kind === 'today' ? '오늘 학습을 준비하는 중…' : '장을 여는 중…'}</p>;

  // 완료한 장을 회독으로 연 경우
  if (mode === 'round' && progress && progress.completed_at !== null) {
    return <CompletedChapter content={content} progress={progress} />;
  }
  // 간격 반복 : 지금 낼 카드가 없음
  if (mode === 'srs' && !currentId) return <NothingToday content={content} chapter={ch} />;
  if (!kanji || (mode === 'round' && !progress)) return <Navigate replace to="/levels" />;

  let title: string;
  let done: number;
  let total: number;
  if (mode === 'round' && progress) {
    title = `${levelName(progress.level)} · ${progress.chapter}장 · ${roundNumber(progress)}회독`;
    done = roundDone(progress);
    total = progress.round_size;
  } else {
    done = items.length;
    total = items.length + queue.length;
    if (mode === 'retry' && ch) title = `${levelName(ch.level)} · ${ch.chapter}장 · 다시`;
    else {
      const isNew = (cards.get(kanji.id)?.status ?? 'new') === 'new';
      const home = content.chapterOf.get(kanji.id);
      const kind = isNew ? `새 한자${scope.kind === 'today' && home ? ` · ${levelName(home.level)} ${home.chapter}장` : ''}` : '복습';
      title = ch ? `${levelName(ch.level)} · ${ch.chapter}장 · ${kind}` : `오늘 · ${kind}`;
    }
  }
  const anyOpen = reveal.ko || reveal.reading;
  const favorite = cards.get(kanji.id)?.favorite ?? false;
  const again = pending.has(kanji.id);

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
      <ProgressBar value={done} max={total} label="이번 세션 진행" />

      <section
        className={styles.card}
        onClick={() => setReveal(anyOpen && reveal.ko && reveal.reading ? { ko: false, reading: false } : { ko: true, reading: true })}
        aria-label="학습 카드. 누르면 전부 펼치거나 접습니다"
      >
        {again && <span className={styles.againTag}>다시</span>}
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
        <GradeButtons
          threeGrade={settings.f6_three_grade}
          longPress={settings.longpress_graduate}
          disabled={busy}
          onGrade={(r) => void grade(r)}
        />
      </footer>

      <Sheet open={confirmExit} title="세션을 끝낼까요?" onClose={() => setConfirmExit(false)}>
        <p className={styles.sheetText}>
          {mode === 'round'
            ? '지금까지의 판정은 저장되어 있습니다. 다음에 이 장을 열면 같은 회독의 남은 한자부터 이어집니다.'
            : '지금까지의 판정은 저장되어 있습니다. 남은 카드는 다음 학습 때 다시 나옵니다.'}
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

/** 간격 반복 세션의 카드 목록 (SPEC 4.2 세션 구성) */
function srsQueue(
  content: Content,
  settings: Settings,
  open: ReadonlySet<string>,
  completed: ReadonlySet<string>,
  cards: Map<string, CardState>,
  today: { reviewed: number; new_count: number } | undefined,
  chapter: Chapter | undefined,
): string[] {
  const size = sessionLimit(settings.session_size);
  const base = { cards, now: Date.now(), size, order: settings.card_order, rng: Math.random };
  if (chapter) {
    // 장을 골라 들어온 경우 : 그 장의 복습과 새 한자. 하루 상한은 적용하지 않는다 (미리 하기)
    const pool = chapter.ids.map((id) => cards.get(id)).filter((c): c is CardState => !!c);
    return buildSrsQueue({ ...base, pool, newCandidates: chapter.ids, reviewRoom: Infinity, newRoom: Infinity }).queue;
  }
  // 오늘 학습 : 전체 복습 + 열린 미완료 장의 새 한자 (장 순서대로)
  const room = dailyRoom(today, settings.srs_new_per_day, settings.srs_review_cap);
  const newCandidates = content.chapters
    .filter((c) => open.has(chapterKey(c.level, c.chapter)) && !completed.has(chapterKey(c.level, c.chapter)))
    .flatMap((c) => c.ids);
  return buildSrsQueue({ ...base, pool: [...cards.values()], newCandidates, ...room }).queue;
}

/** 결과 화면 머리 표시. roundNo : 이번 세션의 회독 번호 (회독 방식) */
function whereLabel(mode: Mode, scope: Scope, roundNo: number): string {
  if (scope.kind === 'today') return '오늘 학습';
  const at = `${levelName(scope.level)} · ${scope.chapter}장`;
  if (mode === 'retry') return `${at} · 공부하겠음 다시`;
  if (mode === 'srs') return `${at} · 간격 반복`;
  return roundNo > 0 ? `${at} · ${roundNo}회독` : at;
}

/** 미리 할 장 : 열려 있고 아직 새 한자가 남은 첫 장 */
export function aheadChapter(content: Content, open: ReadonlySet<string>, cards: ReadonlyMap<string, CardState>): Chapter | null {
  return (
    content.chapters.find(
      (c) => open.has(chapterKey(c.level, c.chapter)) && c.ids.some((id) => (cards.get(id)?.status ?? 'new') === 'new'),
    ) ?? null
  );
}

/** 간격 반복에서 지금 낼 카드가 없을 때 (SPEC 6장 '오늘 할 것이 없음') */
function NothingToday({ content, chapter }: { content: Content; chapter: Chapter | undefined }) {
  const navigate = useNavigate();
  const view = useProgressView(content);
  const ahead = view ? aheadChapter(content, view.summary.open, view.cards) : null;
  return (
    <div className={styles.completed}>
      <Stamp size="large" />
      <p className={styles.completedTitle}>
        {chapter ? `${levelName(chapter.level)} ${chapter.chapter}장은 지금 복습할 한자가 없습니다` : '오늘 분량 완료'}
      </p>
      <p className={styles.sheetText}>
        {chapter ? '복습 예정일이 되면 오늘 학습에 다시 나옵니다.' : '오늘 복습할 카드와 새 한자를 모두 마쳤습니다.'}
      </p>
      <div className={styles.sheetActions}>
        {ahead && (
          <Button tone="primary" block onClick={() => navigate(`/study/${ahead.level}/${ahead.chapter}`, { replace: true })}>
            다음 장 미리 하기 ({levelName(ahead.level)} {ahead.chapter}장)
          </Button>
        )}
        <Button block onClick={() => navigate('/', { replace: true })}>
          홈으로
        </Button>
      </div>
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
            <span className={styles.rowLabel} lang="ja">
              音
            </span>
            <span className={styles.reading} lang="ja">
              {kanji.on.length ? kanji.on.join('・') : '—'}
            </span>
          </div>
          <div className={`${styles.row} ${styles.rowKun}`}>
            <span className={styles.rowLabel} lang="ja">
              訓
            </span>
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
      <p className={styles.sheetText}>
        {progress.pass_count > 0 ? `${progress.pass_count}회독으로 완료했습니다. ` : ''}다시 공부하려면 단계 지도에서 [처음부터
        다시]를 누르세요.
      </p>
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
