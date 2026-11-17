import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ContentGate } from '../components/ContentGate';
import { GradeButtons } from '../components/GradeButtons';
import { ProgressBar } from '../components/ProgressBar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { BackIcon, CloseIcon, StarIcon, UndoIcon } from '../components/icons';
import { KoLine, PhoneticChips, ReadingLines, RuleHints, RuleSheet, SimilarBlock } from '../components/KanjiSections';
import { useRelations, type Relations } from '../content/relations';
import { DetailBody } from './Detail';
import { SpeakButton, WordList, useCanSpeak } from '../components/Words';
import { speak, stopSpeaking } from '../audio/tts';
import { readingSpeech } from '../domain/speech';
import { getChapter, levelName, type Chapter, type Content, type Kanji } from '../content/content';
import { chapterKey, nextChapter, summarizeChapters } from '../domain/progress';
import { newCard, roundDone, roundNumber, shuffle } from '../domain/scheduler';
import {
  addCount,
  emptyCounts,
  REQUEUE_GAP,
  requeue,
  sessionLimit,
  vagueRequeuePosition,
  type SessionCounts,
} from '../domain/session';
import { buildSrsQueue, dailyRoom } from '../domain/srs';
import { planReverse, reverseCandidates, reversePrompt, type ReverseItem } from '../domain/reverse';
import { WritingPad, type Point } from '../components/Strokes';
import { useCardMotion, type SwipeHint } from '../components/useCardMotion';
import { feedback } from '../audio/feedback';
import { useStrokes } from '../content/lazyData';
import type { CardState, ChapterProgress, Rating } from '../domain/types';
import {
  finishSession,
  getAllCards,
  getAllChapters,
  getAllReverseCards,
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
  const list = location.pathname.endsWith('/list');
  const routeState = location.state as StudyRouteState | null;
  // 상세 겹침 화면을 열면 방문 기록이 하나 늘어난다. 그때도 같은 세션이 이어지도록 처음 들어온 기록의 키를 쓴다
  const sessionKey = routeState?.session ?? location.key;
  const retryIds = routeState?.retryIds;
  if (today && !settings.f5_srs) return <Navigate replace to="/study" />;
  // 고른 한자만 학습 (통계의 [이 한자만 학습]) : 목록 없이 들어오면 통계로
  if (list) {
    if (!retryIds?.length) return <Navigate replace to="/stats" />;
    return (
      <StudySession key={sessionKey} content={content} scope={{ kind: 'list', label: routeState?.label ?? '고른 한자' }} retryIds={retryIds} />
    );
  }
  if (!today && (level === undefined || chapter === undefined)) return <ResolveCurrent content={content} />;
  return (
    <StudySession
      key={sessionKey}
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

/** 학습 화면의 방문 기록 상태 */
interface StudyRouteState {
  retryIds?: string[];
  label?: string;
  /** 세션을 처음 연 기록의 키 */
  session?: string;
  /** 카드 위에 겹쳐 연 한자 상세 (위에 쌓인 순서) */
  peek?: string[];
}

type Scope = { kind: 'today' } | { kind: 'chapter'; level: number; chapter: number } | { kind: 'list'; label: string };
type Mode = 'round' | 'retry' | 'srs';
type RevealState = { ko: boolean; reading: boolean };

/** 되돌리기 때 화면 상태를 그대로 돌려놓기 위한 사본 */
interface UiSnapshot {
  progress: ChapterProgress | null;
  queue: string[];
  counts: SessionCounts;
  items: SessionItem[];
  card: CardState | undefined;
  seen: Set<string>;
  repeated: Set<string>;
  pending: Set<string>;
  completed: { level: number; chapter: number }[];
  rev: ReverseItem[];
  revCards: Map<string, CardState>;
  fwdDone: number;
  fwdFinished: boolean;
}

/** 세션에서 판정한 카드 한 장. reverse : 역방향(F7) 카드 */
type SessionItem = { id: string; rating: Rating; reverse?: boolean };

interface Props {
  content: Content;
  scope: Scope;
  /** [공부하겠음만 다시] 연습, 또는 고른 한자 학습(scope list) : 회독 진행과 별도로 이 한자들만 */
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
  const [items, setItems] = useState<SessionItem[]>([]);
  /** 이번 세션에서 한 번 이상 판정한 한자 */
  const [seen, setSeen] = useState<Set<string>>(new Set());
  /** 애매함으로 이미 한 번 더 낸 한자 */
  const [repeated, setRepeated] = useState<Set<string>>(new Set());
  /** 다시 내기로 했지만 아직 다시 판정하지 않은 한자 */
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<{ level: number; chapter: number }[]>([]);
  /** F7 : 아직 내지 않은 역방향 카드 (정방향을 at장 판정한 뒤에 낸다) */
  const [rev, setRev] = useState<ReverseItem[]>([]);
  const [revCards, setRevCards] = useState<Map<string, CardState>>(new Map());
  /** 이번 세션에서 판정한 정방향 카드 수 */
  const [fwdDone, setFwdDone] = useState(0);
  /** 정방향 분량을 마치고 남은 역방향 카드만 내는 중 */
  const [fwdFinished, setFwdFinished] = useState(false);
  /** 역방향 카드 : 한자를 펼쳤는가, 써 본 획 */
  const [revOpen, setRevOpen] = useState(false);
  const [revLines, setRevLines] = useState<Point[][]>([]);
  const [reveal, setReveal] = useState<RevealState>(() => initialReveal(settings.auto_reveal));
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ snapshot: UndoSnapshot; ui: UiSnapshot; id: string } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  /**
   * 카드 위에 겹쳐 연 한자 상세. 세션을 잃지 않도록 화면은 그대로 두고, 한 겹마다 방문 기록을 하나 쌓는다.
   * 그래서 휴대폰의 뒤로 가기(스와이프·버튼)는 겹침 화면을 한 겹씩 닫고 학습 카드로 돌아온다.
   */
  const location = useLocation();
  const routeState = location.state as StudyRouteState | null;
  const peek = routeState?.peek ?? [];
  const openPeek = (id: string) =>
    navigate(location.pathname, {
      state: { ...routeState, session: routeState?.session ?? location.key, peek: [...peek, id] } satisfies StudyRouteState,
    });
  const closePeek = (layers: number) => {
    if (layers > 0) navigate(-layers);
  };
  const [ruleSheet, setRuleSheet] = useState<string | null>(null);
  const relations = useRelations();
  const shownAt = useRef(Date.now());
  const sessionId = useRef<number | null>(null);
  const startedAt = useRef(Date.now());
  /** 정방향 분량이 끝났을 때의 회독 결과 (남은 역방향 카드를 마친 뒤 결과 화면에 넘긴다) */
  const deferred = useRef<{ roundCompleted: boolean; progress: ChapterProgress | null } | null>(null);

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
      let forwardCount = 0;
      if (scope.kind === 'list' && retryIds) {
        // 고른 한자 : 주어진 순서(자주 틀린 순) 또는 섞어서
        const valid = [...new Set(retryIds)].filter((id) => content.byId.has(id));
        if (cancelled) return;
        setCards(allCards);
        setQueue(settings.card_order === 'shuffle' ? shuffle(valid, Math.random) : valid);
      } else if (mode === 'srs') {
        const q = srsQueue(content, settings, summary.open, summary.completed, allCards, today, ch);
        if (cancelled) return;
        setCards(allCards);
        setQueue(q);
        forwardCount = q.length;
      } else if (ch) {
        // 회독 : 진행 기록이 있으면 같은 회독의 남은 한자부터 이어진다
        const { progress: p, cards: c } = await openChapter(ch.level, ch.chapter, ch.ids, settings.card_order);
        if (cancelled) return;
        setProgress(p);
        setCards(c);
        if (!retryIds) forwardCount = Math.min(sessionLimit(settings.session_size), p.round_queue.length);
        if (retryIds) {
          const valid = retryIds.filter((id) => ch.ids.includes(id));
          setQueue(settings.card_order === 'shuffle' ? shuffle(valid, Math.random) : ch.ids.filter((id) => valid.includes(id)));
        }
      }
      // F7 역방향 : 정방향 카드 사이에 비율만큼 끼워 넣는다 ([다시]·고른 한자 학습에서는 내지 않음)
      if (settings.f7_reverse && mode !== 'retry' && forwardCount > 0) {
        const reverse = await getAllReverseCards();
        const allIds = content.levelIds.flatMap((l) => l.ids);
        const candidates = reverseCandidates({
          // 이 장의 한자를 먼저, 그다음 다른 장에서 이미 익힌 한자
          ids: ch ? [...ch.ids, ...allIds.filter((id) => !ch.ids.includes(id))] : allIds,
          forward: allCards,
          reverse,
          srs: mode === 'srs',
          now: Date.now(),
        });
        const plan = planReverse({
          candidates,
          sources: content.byId,
          forwardCount,
          ratio: settings.reverse_ratio,
          setting: settings.reverse_types,
          rng: Math.random,
        });
        if (cancelled) return;
        setRevCards(reverse);
        setRev(plan);
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

  const currentId = fwdFinished ? undefined : mode === 'round' ? progress?.round_queue[0] : queue[0];
  const kanji = currentId ? content.byId.get(currentId) : undefined;
  // 지금 낼 역방향 카드 : 정해 둔 위치에 왔거나, 정방향 카드가 더 없을 때
  const revItem = rev.length > 0 && (rev[0].at <= fwdDone || !currentId) ? rev[0] : null;
  const revKanji = revItem ? content.byId.get(revItem.id) : undefined;
  const limit = sessionLimit(settings.session_size);

  // F11 자동 재생 : 읽기를 펼칠 때 음독·훈독을 읽는다 (tts_auto). 카드를 넘기면 읽던 것을 멈춘다
  const canSpeak = useCanSpeak();
  const readingOpen = reveal.reading;
  useEffect(() => {
    if (kanji && !revItem && readingOpen && canSpeak && settings.tts_auto) speak(readingSpeech(kanji.on, kanji.kun), settings.tts_rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanji?.id, revItem?.id, readingOpen]);
  useEffect(() => stopSpeaking, [kanji?.id, revItem?.id]);

  // 카드 움직임 (SPEC 5.6) : 판정 시 나가기, 스와이프 판정. 카드가 바뀔 때마다 나타나기
  const motion = useCardMotion({
    swipe: settings.swipe_enabled && (!revItem || revOpen),
    threeGrade: settings.f6_three_grade,
    cardKey: `${items.length}:${revItem ? `r${revItem.id}` : (currentId ?? '')}`,
    onSwipe: (r) => void judge(r),
  });
  const animating = useRef(false);
  /** 판정 : 피드백 → 카드 나가기 → 기록 (버튼·스와이프 공통) */
  async function judge(rating: Rating) {
    if (busy || animating.current) return;
    animating.current = true;
    feedback(rating);
    try {
      await motion.exit(rating);
      if (revItem) await gradeReverse(revItem, rating);
      else await grade(rating);
    } catch (err) {
      motion.reset();
      throw err;
    } finally {
      animating.current = false;
    }
  }
  // 답이 카드 높이를 넘을 때만 카드 안 세로 스크롤을 허용한다 (그 밖에서는 위로 끌기가 애매함 판정)
  useLayoutEffect(() => {
    const body = motion.ref.current?.querySelector<HTMLElement>('[data-card-body]');
    if (body) body.dataset.overflow = String(body.scrollHeight > body.clientHeight + 1);
  });

  const resetForNextCard = () => {
    setReveal(initialReveal(settings.auto_reveal));
    setRevOpen(false);
    setRevLines([]);
    shownAt.current = Date.now();
  };

  const finish = async (
    final: { counts: SessionCounts; items: SessionItem[]; completed: { level: number; chapter: number }[] },
    roundCompleted: boolean,
    p: ChapterProgress | null,
  ) => {
    if (sessionId.current !== null) await finishSession(sessionId.current, final.counts);
    const last = final.completed.at(-1);
    const next = last ? nextChapter(content.outline, last.level, last.chapter) : null;
    const here = ch ? `/study/${ch.level}/${ch.chapter}` : scope.kind === 'list' ? '/stats' : '/study/today';
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
      continueLabel:
        scope.kind === 'list' ? '통계로' : mode !== 'srs' && last && next ? `계속하기 (${levelName(next.level)} ${next.chapter}장)` : '계속하기',
      retryTo: scope.kind === 'list' ? '/study/list' : mode !== 'srs' && ch ? here : null,
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
        // 고른 한자 학습은 지금의 복습 방식(F5)을 따른다
        scheduler: mode === 'srs' || (scope.kind === 'list' && settings.f5_srs) ? { kind: 'srs', options: { retention: settings.srs_retention, fuzz: true } } : { kind: 'round' },
        chapter: mode === 'retry' || !home ? null : { level: home.level, chapter: home.chapter, ids: home.ids, order: settings.card_order },
        requeueAt,
      });

      const ui: UiSnapshot = {
        progress,
        queue,
        counts,
        items,
        card: cards.get(currentId),
        seen,
        repeated,
        pending,
        completed,
        rev,
        revCards,
        fwdDone,
        fwdFinished,
      };
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
      setFwdDone(fwdDone + 1);

      const firstCount = firstTime ? nextSeen.size : seen.size;
      const finished =
        mode === 'round'
          ? res.roundCompleted || (firstCount >= limit && nextPending.size === 0)
          : nextQueue.length === 0;
      if (finished && rev.length > 0) {
        // 정방향 분량은 끝났지만 역방향 카드가 남았다 : 그것만 마저 낸다
        setFwdFinished(true);
        deferred.current = { roundCompleted: mode === 'round' && res.roundCompleted, progress: mode === 'round' ? res.progress : null };
      } else if (finished) {
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

  /** 역방향(F7) 카드 판정 : 역방향 카드만 스케줄하고 장 진행에는 반영하지 않는다 */
  const gradeReverse = async (item: ReverseItem, rating: Rating) => {
    if (busy) return;
    setBusy(true);
    try {
      sessionId.current ??= await startSession(ch?.level ?? -1, ch?.chapter ?? 0);
      const res = await recordGrade({
        kanjiId: item.id,
        direction: 'reverse',
        rating,
        elapsedMs: Date.now() - shownAt.current,
        sessionId: sessionId.current,
        scheduler: mode === 'srs' ? { kind: 'srs', options: { retention: settings.srs_retention, fuzz: true } } : { kind: 'round' },
        chapter: null,
      });
      const ui: UiSnapshot = {
        progress,
        queue,
        counts,
        items,
        card: undefined,
        seen,
        repeated,
        pending,
        completed,
        rev,
        revCards,
        fwdDone,
        fwdFinished,
      };
      const nextCounts = addCount(counts, rating);
      const nextItems = [...items, { id: item.id, rating, reverse: true }];
      const nextRev = rev.slice(1);
      setRevCards(new Map(revCards).set(item.id, res.card));
      setCounts(nextCounts);
      setItems(nextItems);
      setRev(nextRev);
      if (nextRev.length === 0 && !currentId) {
        const d = deferred.current ?? { roundCompleted: false, progress: mode === 'round' ? progress : null };
        await finish({ counts: nextCounts, items: nextItems, completed }, d.roundCompleted, d.progress);
        return;
      }
      setUndo({ snapshot: res.undo, ui, id: item.id });
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
      setRev(ui.rev);
      setFwdDone(ui.fwdDone);
      setFwdFinished(ui.fwdFinished);
      if (!ui.fwdFinished) deferred.current = null;
      if (undo.snapshot.direction === 'reverse') {
        setRevCards(ui.revCards);
      } else {
        const restored = new Map(cards);
        if (ui.card) restored.set(undo.id, ui.card);
        else restored.delete(undo.id);
        setCards(restored);
      }
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
    if (items.length === 0) navigate(scope.kind === 'today' ? '/' : scope.kind === 'list' ? '/stats' : '/levels');
    else await finish({ counts, items, completed }, false, mode === 'round' ? progress : null);
  };

  if ((scope.kind === 'chapter' && !ch) || blocked) return <Navigate replace to="/levels" />;
  if (!loaded) return <p className={styles.loading}>{scope.kind === 'today' ? '오늘 학습을 준비하는 중…' : '장을 여는 중…'}</p>;

  // 완료한 장을 회독으로 연 경우
  if (mode === 'round' && progress && progress.completed_at !== null) {
    return <CompletedChapter content={content} progress={progress} />;
  }
  // 간격 반복 : 지금 낼 카드가 없음
  if (mode === 'srs' && !currentId && !revItem) return <NothingToday content={content} chapter={ch} />;
  if ((!kanji && !revKanji) || (mode === 'round' && !progress)) return <Navigate replace to="/levels" />;

  let title: string;
  let done: number;
  let total: number;
  if (mode === 'round' && progress) {
    title = `${levelName(progress.level)} · ${progress.chapter}장 · ${roundNumber(progress)}회독`;
    done = roundDone(progress);
    total = progress.round_size;
  } else {
    done = items.length;
    total = items.length + queue.length + rev.length;
    if (scope.kind === 'list') title = scope.label;
    else if (mode === 'retry' && ch) title = `${levelName(ch.level)} · ${ch.chapter}장 · 다시`;
    else if (revItem || !kanji) title = ch ? `${levelName(ch.level)} · ${ch.chapter}장 · 역방향` : '오늘 · 역방향';
    else {
      const isNew = (cards.get(kanji.id)?.status ?? 'new') === 'new';
      const home = content.chapterOf.get(kanji.id);
      const kind = isNew ? `새 한자${scope.kind === 'today' && home ? ` · ${levelName(home.level)} ${home.chapter}장` : ''}` : '복습';
      title = ch ? `${levelName(ch.level)} · ${ch.chapter}장 · ${kind}` : `오늘 · ${kind}`;
    }
  }
  const anyOpen = reveal.ko || reveal.reading;

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

      {revItem && revKanji ? (
        <>
          <ReverseCard
            kanji={revKanji}
            item={revItem}
            open={revOpen}
            onOpen={() => setRevOpen(true)}
            lines={revLines}
            onLines={setRevLines}
            settings={settings}
            motion={motion}
          />
          <footer className={styles.footer}>
            {revOpen ? (
              <GradeButtons
                threeGrade={settings.f6_three_grade}
                longPress={settings.longpress_graduate}
                disabled={busy}
                onGrade={(r) => void judge(r)}
              />
            ) : (
              <Button tone="primary" block className={styles.revealButton} onClick={() => setRevOpen(true)}>
                한자 보기
              </Button>
            )}
          </footer>
        </>
      ) : (
        kanji && (
          <>
          <section
            ref={motion.ref}
            className={`${styles.card} ${settings.swipe_enabled ? styles.swipeable : ''}`}
            onClick={() => setReveal(anyOpen && reveal.ko && reveal.reading ? { ko: false, reading: false } : { ko: true, reading: true })}
            aria-label="학습 카드. 누르면 전부 펼치거나 접습니다"
            {...motion.handlers}
          >
            <SwipeEdge hint={motion.hint} />
            {pending.has(kanji.id) && <span className={styles.againTag}>다시</span>}
            <button
              type="button"
              className={`${styles.star} ${cards.get(kanji.id)?.favorite ? styles.starOn : ''}`}
              aria-label={cards.get(kanji.id)?.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
              aria-pressed={cards.get(kanji.id)?.favorite ?? false}
              onClick={(e) => {
                e.stopPropagation();
                void onFavorite();
              }}
            >
              <StarIcon filled={cards.get(kanji.id)?.favorite ?? false} />
            </button>

            <div className={styles.cardBody} data-card-body>
              <div className={styles.kanjiRow}>
                <div className={`${styles.kanji} ${anyOpen ? styles.kanjiSmall : ''}`} lang="ja">
                  {kanji.id}
                </div>
                {anyOpen && (
                  <SpeakButton className={styles.kanjiSpeak} texts={readingSpeech(kanji.on, kanji.kun)} label={`${kanji.id} 읽기 듣기`} />
                )}
              </div>
              {anyOpen && (
                <Answer
                  key={kanji.id}
                  content={content}
                  kanji={kanji}
                  reveal={reveal}
                  settings={settings}
                  relations={relations}
                  studyMarks={cards.get(kanji.id)?.study_marks ?? 0}
                  onRule={setRuleSheet}
                  onOpen={openPeek}
                />
              )}
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
              onGrade={(r) => void judge(r)}
            />
          </footer>
          </>
        )
      )}

      <RuleSheet
        content={content}
        relations={relations}
        ruleId={ruleSheet}
        self={(revKanji ?? kanji)!.id}
        onClose={() => setRuleSheet(null)}
        onOpenKanji={(id) => {
          setRuleSheet(null);
          openPeek(id);
        }}
      />
      {peek.length > 0 && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="한자 상세">
          <header className={styles.overlayHeader}>
            <button type="button" className={styles.iconButton} aria-label="뒤로" onClick={() => closePeek(1)}>
              <BackIcon />
            </button>
            <p className={styles.title}>한자 상세</p>
            <button type="button" className={styles.iconButton} aria-label="학습 카드로" onClick={() => closePeek(peek.length)}>
              <CloseIcon />
            </button>
          </header>
          <div className={styles.overlayBody}>
            <DetailBody key={peek[peek.length - 1]} content={content} id={peek[peek.length - 1]} onOpen={openPeek} />
          </div>
        </div>
      )}

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
  if (scope.kind === 'list') return scope.label;
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

/**
 * 역방향 카드 (F7, SPEC S3) : 앞면에 한국 훈음 또는 히라가나를 48px로, 상단에 '한자 떠올리기' 라벨.
 * 카드를 누르거나 [한자 보기]로 한자를 펼친 뒤 자기 판정한다.
 * F10이 켜져 있으면 펼치기 전에 칸에 직접 써 보고, 펼치면 본보기를 겹쳐 비교한다 (채점 없음).
 */
function ReverseCard({
  kanji,
  item,
  open,
  onOpen,
  lines,
  onLines,
  settings,
  motion,
}: {
  kanji: Kanji;
  item: ReverseItem;
  open: boolean;
  onOpen: () => void;
  lines: Point[][];
  onLines: (lines: Point[][]) => void;
  settings: Settings;
  motion: ReturnType<typeof useCardMotion>;
}) {
  const strokes = useStrokes(kanji.id);
  const prompt = reversePrompt(kanji, item.type);
  const write = settings.f10_stroke;
  return (
    <section
      ref={motion.ref}
      className={`${styles.card} ${styles.reverseCard} ${settings.swipe_enabled && open ? styles.swipeable : ''}`}
      onClick={() => !open && onOpen()}
      aria-label={open ? '역방향 카드' : '역방향 카드. 누르면 한자를 펼칩니다'}
      {...motion.handlers}
    >
      <SwipeEdge hint={motion.hint} />
      <span className={styles.reverseLabel}>한자 떠올리기</span>
      <div className={styles.cardBody} data-card-body>
        <p className={styles.reverseHint}>{item.type === 'ko' ? '한국 훈음' : '읽기'}</p>
        <p
          className={`${styles.reversePrompt} ${item.type === 'ko' ? styles.reverseKo : styles.reverseKana}`}
          lang={item.type === 'ko' ? 'ko' : 'ja'}
        >
          {prompt.join('・')}
        </p>
        {write && (
          <div className={styles.recall}>
            <WritingPad
              data={strokes}
              lines={lines}
              onLines={onLines}
              showModel={open}
              label={open ? '쓴 획과 본보기를 겹쳐 보는 칸' : '써 보는 칸. 손가락이나 펜으로 쓰세요'}
              className={styles.recallPad}
            />
            {!open && (
              <button
                type="button"
                className={styles.recallClear}
                disabled={lines.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onLines([]);
                }}
              >
                지우기
              </button>
            )}
          </div>
        )}
        {open && (
          <div className={styles.answer}>
            <div className={`${styles.kanji} ${styles.kanjiSmall}`} lang="ja">
              {kanji.id}
            </div>
            <KoLine kanji={kanji} f1={settings.f1_hunum} f2={settings.f2_ko_form} />
            <ReadingLines kanji={kanji} f1={settings.f1_hunum} />
          </div>
        )}
      </div>
    </section>
  );
}

const HINT_LABEL: Record<Rating, string> = { study: '공부하겠음', vague: '애매함', know: '알고있음', graduate: '졸업' };

/** 끄는 동안·판정할 때 카드 가장자리의 판정 색과 라벨. 졸업이면 작은 도장 */
function SwipeEdge({ hint }: { hint: SwipeHint | null }) {
  if (!hint) return null;
  return (
    <div className={styles.swipeEdge} data-rating={hint.rating} style={{ opacity: hint.progress }} aria-hidden="true">
      <span className={styles.swipeLabel}>{HINT_LABEL[hint.rating]}</span>
      {hint.rating === 'graduate' && (
        <span className={styles.swipeStamp}>
          <Stamp animate />
        </span>
      )}
    </div>
  );
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

/**
 * 답 영역 (SPEC S3 펼친 뒤, 2.3)
 * - [한국어] : 한국 훈음 줄(F1 켬 : 대표 크게·나머지 작게·뜻 풀이 / 끔 : 뜻 풀이 또는 대표 훈음) + 정자체(F2)
 * - [읽기] : 음독·훈독 줄
 * - 전부 펼침일 때만 : 💡 음 대응(F3), 같은 부분·같은 음독(F4), 닮은 한자(F8)
 */
function Answer({
  content,
  kanji,
  reveal,
  settings,
  relations,
  studyMarks,
  onRule,
  onOpen,
}: {
  content: Content;
  kanji: Kanji;
  reveal: RevealState;
  settings: Settings;
  relations: Relations | null;
  studyMarks: number;
  onRule: (ruleId: string) => void;
  onOpen: (id: string) => void;
}) {
  const all = reveal.ko && reveal.reading;
  return (
    <div className={styles.answer}>
      {reveal.ko && <KoLine kanji={kanji} f1={settings.f1_hunum} f2={settings.f2_ko_form} />}
      {reveal.reading && <ReadingLines kanji={kanji} f1={settings.f1_hunum} />}
      {all && settings.f3_sound_rule && <RuleHints kanji={kanji} relations={relations} onOpen={onRule} />}
      {all && settings.f9_words && <WordList kanji={kanji} content={content} limit={settings.words_count} />}
      {all && settings.f4_phonetic && <PhoneticChips kanji={kanji} content={content} relations={relations} onOpen={onOpen} />}
      {all && settings.f8_similar && (
        <SimilarBlock
          kanji={kanji}
          content={content}
          autoOpen={settings.similar_auto_open && studyMarks >= 2}
          onOpen={onOpen}
          onDetail={() => onOpen(kanji.id)}
        />
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
