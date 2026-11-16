import { describe, expect, it } from 'vitest';
import { advanceSrsChapter, buildSrsQueue, dailyRoom, endOfDay, gradeSrs, isDue, type SrsOptions } from './srs';
import { advanceRound, gradeCard, initProgress, newCard } from './scheduler';
import { requeue, vagueRequeuePosition } from './session';
import type { CardState, Rating } from './types';

const OPTS: SrsOptions = { retention: 0.9, fuzz: false };
const NOW = new Date(2026, 10, 16, 9, 0, 0).getTime();
const MIN = 60_000;
const DAY = 86_400_000;
const fixedRng = () => 0;

/** 새 카드에 판정을 차례로 적용한다. 각 판정은 직전 출제일에 한다 */
function play(ratings: Rating[], start = NOW): CardState {
  let card = newCard('貼');
  let t = start;
  for (const r of ratings) {
    card = gradeSrs(card, r, t, OPTS);
    t = Math.max(t, card.due ?? t);
  }
  return card;
}

describe('간격 반복 판정 (F5 켬)', () => {
  it('공부하겠음 < 애매함 < 알고있음 순으로 다음 출제가 늦다 (새 카드)', () => {
    const again = gradeSrs(newCard('a'), 'study', NOW, OPTS);
    const hard = gradeSrs(newCard('a'), 'vague', NOW, OPTS);
    const good = gradeSrs(newCard('a'), 'know', NOW, OPTS);
    expect(again.due! - NOW).toBe(1 * MIN);
    expect(hard.due! - NOW).toBe(1.5 * MIN);
    expect(good.due!).toBeGreaterThan(hard.due!);
  });

  it('복습 단계에서는 Again < Hard < Good 순으로 간격이 늘어난다', () => {
    const learned = play(['know', 'know']); // 학습 단계를 지나 복습 상태
    expect(learned.fsrs_state).toBe(2);
    expect(learned.scheduled_days).toBeGreaterThanOrEqual(1);
    const t = learned.due!;
    const again = gradeSrs(learned, 'study', t, OPTS);
    const hard = gradeSrs(learned, 'vague', t, OPTS);
    const good = gradeSrs(learned, 'know', t, OPTS);
    expect(again.due!).toBeLessThan(hard.due!);
    expect(hard.due!).toBeLessThan(good.due!);
    expect(again.lapses).toBe(1);
    expect(good.scheduled_days).toBeGreaterThan(learned.scheduled_days);
  });

  it('목표 기억률이 높을수록 간격이 짧다', () => {
    const learned = play(['know', 'know']);
    const t = learned.due!;
    const at95 = gradeSrs(learned, 'know', t, { retention: 0.95, fuzz: false });
    const at80 = gradeSrs(learned, 'know', t, { retention: 0.8, fuzz: false });
    expect(at95.scheduled_days).toBeLessThan(at80.scheduled_days);
  });

  it('status는 회독 방식과 같은 규칙 : 공부하겠음·애매함 learning, 알고있음 review', () => {
    expect(gradeSrs(newCard('a'), 'study', NOW, OPTS)).toMatchObject({ status: 'learning', study_marks: 1 });
    expect(gradeSrs(newCard('a'), 'vague', NOW, OPTS)).toMatchObject({ status: 'learning', study_marks: 0 });
    expect(gradeSrs(newCard('a'), 'know', NOW, OPTS)).toMatchObject({ status: 'review', pass_count: 1 });
  });

  it('길게 눌러 졸업 : FSRS를 계산하지 않고 graduated', () => {
    const g = gradeSrs(newCard('a'), 'graduate', NOW, OPTS);
    expect(g.status).toBe('graduated');
    expect(g.due).toBeNull();
    expect(g.fsrs_state).toBe(0);
  });

  it('회독 방식에서 판정한 카드(FSRS 기록 없음)는 새 FSRS 카드로 시작한다', () => {
    const fromRound = gradeCard(newCard('a'), 'know', NOW - DAY); // F5 끔에서 알고있음
    expect(fromRound.due).toBeNull();
    const next = gradeSrs(fromRound, 'know', NOW, OPTS);
    expect(next.fsrs_state).toBe(2);
    expect(next.pass_count).toBe(2);
  });
});

describe('알고있음은 그날 다시 나오지 않는다 (SPEC 4.2)', () => {
  const tomorrow = endOfDay(NOW) + 1;
  const sameDay = (c: CardState, at: number) => c.due! <= endOfDay(at);

  it('새 카드에 알고있음 : 학습 단계 없이 바로 Review, 출제일은 내일 이후', () => {
    const good = gradeSrs(newCard('a'), 'know', NOW, OPTS);
    expect(good.fsrs_state).toBe(2);
    expect(good.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(good.due!).toBeGreaterThanOrEqual(tomorrow);
    expect(isDue(good, NOW)).toBe(false);
  });

  it('간격에 무작위를 섞어도(앱 설정) 내일 이후', () => {
    for (let i = 0; i < 20; i++) {
      const good = gradeSrs(newCard(`k${i}`), 'know', NOW + i * MIN, { retention: 0.95, fuzz: true });
      expect(good.due!).toBeGreaterThanOrEqual(endOfDay(NOW + i * MIN) + 1);
    }
  });

  it('공부하겠음·애매함은 그날 안에 다시 나온다 (학습 단계 유지)', () => {
    const again = gradeSrs(newCard('a'), 'study', NOW, OPTS);
    const hard = gradeSrs(newCard('a'), 'vague', NOW, OPTS);
    expect(again.fsrs_state).toBe(1);
    expect(hard.fsrs_state).toBe(1);
    expect(sameDay(again, NOW)).toBe(true);
    expect(sameDay(hard, NOW)).toBe(true);
    expect(isDue(again, NOW)).toBe(true);
  });

  it('공부하겠음 뒤 같은 날 알고있음 : 바로 일 단위', () => {
    const again = gradeSrs(newCard('a'), 'study', NOW, OPTS);
    const good = gradeSrs(again, 'know', again.due!, OPTS);
    expect(good.fsrs_state).toBe(2);
    expect(good.due!).toBeGreaterThanOrEqual(tomorrow);
  });

  it('복습 카드에 공부하겠음 : 그날 다시(10분), 그 뒤 알고있음이면 일 단위', () => {
    const learned = gradeSrs(newCard('a'), 'know', NOW, OPTS);
    const t = learned.due!;
    const lapse = gradeSrs(learned, 'study', t, OPTS);
    expect(lapse.fsrs_state).toBe(3);
    expect(lapse.due! - t).toBe(10 * MIN);
    const back = gradeSrs(lapse, 'know', lapse.due!, OPTS);
    expect(back.fsrs_state).toBe(2);
    expect(back.due!).toBeGreaterThan(endOfDay(lapse.due!));
  });

  it('오늘 세션 구성 : 알고있음을 받은 카드는 오늘 복습에 다시 들어오지 않는다', () => {
    const good = gradeSrs(newCard('a'), 'know', NOW, OPTS);
    const again = gradeSrs(newCard('b'), 'study', NOW, OPTS);
    const cards = new Map([
      ['a', good],
      ['b', again],
    ]);
    const q = buildSrsQueue({
      pool: [good, again],
      newCandidates: [],
      cards,
      now: NOW + 5 * MIN,
      reviewRoom: 100,
      newRoom: 0,
      size: 20,
      order: 'sequential',
      rng: fixedRng,
    });
    expect(q.queue).toEqual(['b']);
  });
});

describe('오늘 세션 구성 (F5 켬)', () => {
  const review = (id: string, due: number | null): CardState => ({ ...newCard(id), status: 'review', due, fsrs_state: 2 });

  it('오늘 안에 출제일이 된 카드만 복습 대상', () => {
    expect(isDue(review('a', NOW - DAY), NOW)).toBe(true);
    expect(isDue(review('a', endOfDay(NOW)), NOW)).toBe(true);
    expect(isDue(review('a', endOfDay(NOW) + 1), NOW)).toBe(false);
    expect(isDue(review('a', null), NOW)).toBe(true); // F5를 켠 직후 회독 방식 기록
    expect(isDue(newCard('a'), NOW)).toBe(false);
    expect(isDue({ ...review('a', NOW), status: 'graduated' }, NOW)).toBe(false);
  });

  it('복습 카드가 먼저, 그다음 새 한자. 새 한자는 후보 순서대로', () => {
    const pool = [review('b', NOW - 2 * DAY), review('a', NOW - DAY), review('z', NOW + 3 * DAY)];
    const cards = new Map(pool.map((c) => [c.kanji_id, c]));
    const q = buildSrsQueue({
      pool,
      newCandidates: ['a', 'n1', 'n2', 'n3'],
      cards,
      now: NOW,
      reviewRoom: 10,
      newRoom: 2,
      size: 20,
      order: 'sequential',
      rng: fixedRng,
    });
    expect(q.queue).toEqual(['b', 'a', 'n1', 'n2']);
    expect(q).toMatchObject({ reviews: 2, news: 2 });
  });

  it('하루 복습 상한과 세션 크기를 넘지 않는다', () => {
    const pool = Array.from({ length: 30 }, (_, i) => review(`r${i}`, NOW - DAY));
    const base = { pool, newCandidates: ['n1', 'n2'], cards: new Map(), now: NOW, order: 'sequential' as const, rng: fixedRng };
    expect(buildSrsQueue({ ...base, reviewRoom: 5, newRoom: 20, size: 20 }).queue).toHaveLength(7);
    expect(buildSrsQueue({ ...base, reviewRoom: 100, newRoom: 20, size: 20 }).queue).toHaveLength(20);
    expect(buildSrsQueue({ ...base, reviewRoom: 0, newRoom: 0, size: 20 }).queue).toHaveLength(0);
  });

  it('남은 하루 분량 = 상한 - 오늘 판정 수 (복습 수는 전체 판정 - 새 한자)', () => {
    expect(dailyRoom(undefined, 20, 100)).toEqual({ newRoom: 20, reviewRoom: 100 });
    expect(dailyRoom({ reviewed: 30, new_count: 12 }, 20, 100)).toEqual({ newRoom: 8, reviewRoom: 82 });
    expect(dailyRoom({ reviewed: 30, new_count: 25 }, 20, null)).toEqual({ newRoom: 0, reviewRoom: Number.POSITIVE_INFINITY });
  });
});

describe('간격 반복의 장 진행', () => {
  const IDS = ['一', '二', '三'];

  it('장의 한자를 모두 한 번씩 보면 회독 수 +1, 모두 알고있음이면 장 완료', () => {
    const cards = new Map<string, CardState>();
    let p;
    const steps: [string, Rating][] = [
      ['一', 'know'],
      ['二', 'study'],
      ['三', 'know'],
    ];
    let r;
    for (const [id, rating] of steps) {
      cards.set(id, gradeSrs(cards.get(id) ?? newCard(id), rating, NOW, OPTS));
      r = advanceSrsChapter(p, 5, 1, IDS, cards, id, NOW);
      p = r.progress;
    }
    expect(r!.roundCompleted).toBe(true);
    expect(r!.chapterCompleted).toBe(false); // 二가 아직 알고있음을 못 받음
    expect(p!.pass_count).toBe(1);

    cards.set('二', gradeSrs(cards.get('二')!, 'know', NOW + MIN, OPTS));
    r = advanceSrsChapter(p, 5, 1, IDS, cards, '二', NOW + MIN);
    expect(r.chapterCompleted).toBe(true);
    expect(r.progress.completed_at).toBe(NOW + MIN);
  });

  it('졸업한 한자는 회독 대상에서 빠진다', () => {
    const cards = new Map<string, CardState>([['三', { ...newCard('三'), status: 'graduated' }]]);
    const r = advanceSrsChapter(undefined, 5, 1, IDS, cards, '一', NOW);
    expect(r.progress.round_queue).toEqual(['二']);
    expect(r.progress.round_size).toBe(2);
  });
});

describe('애매함 다시 출제 (F6)', () => {
  it('목록에서 빼서 지정 위치에 다시 넣는다', () => {
    expect(requeue(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(requeue(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    expect(requeue(['a', 'b'], 'a', 0)).toEqual(['a', 'b']);
  });

  it('세션 뒤쪽 : 이번 세션에 남은 첫 출제 수만큼 뒤', () => {
    expect(vagueRequeuePosition(10, 3)).toBe(3);
    expect(vagueRequeuePosition(10, Number.POSITIVE_INFINITY)).toBe(10);
    expect(vagueRequeuePosition(2, 5)).toBe(2);
  });

  it('회독 방식 : 애매함은 이번 회독에 남고(다시 출제) 다음 회독에도 나온다', () => {
    const IDS = ['一', '二', '三'];
    const cards = new Map<string, CardState>();
    let p = initProgress(5, 1, IDS, cards, 'sequential', fixedRng, NOW);
    // 一 애매함 → 회독 목록 끝으로
    cards.set('一', gradeCard(newCard('一'), 'vague', NOW));
    let r = advanceRound(p, '一', IDS, cards, 'sequential', fixedRng, NOW, 2);
    p = r.progress;
    expect(p.round_queue).toEqual(['二', '三', '一']);
    // 二, 三 알고있음, 一 다시 애매함(이번엔 위치 없음 → 회독에서 빠짐)
    for (const id of ['二', '三']) {
      cards.set(id, gradeCard(newCard(id), 'know', NOW));
      p = advanceRound(p, id, IDS, cards, 'sequential', fixedRng, NOW).progress;
    }
    cards.set('一', gradeCard(cards.get('一')!, 'vague', NOW));
    r = advanceRound(p, '一', IDS, cards, 'sequential', fixedRng, NOW);
    expect(r.roundCompleted).toBe(true);
    expect(r.progress.round_queue).toEqual(['一']); // 다음 회독에 다시
  });
});
