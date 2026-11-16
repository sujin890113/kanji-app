/** 학습 도메인 타입 (SPEC 3.3, 4장). 화면·DB 코드에 의존하지 않는다. */

export type Direction = 'forward' | 'reverse';
export type CardStatus = 'new' | 'learning' | 'review' | 'graduated';

/**
 * 판정
 * - study : 공부하겠음
 * - vague : 애매함 (F6, M3)
 * - know : 알고있음
 * - graduate : 알고있음 길게 누르기 (즉시 졸업)
 */
export type Rating = 'study' | 'vague' | 'know' | 'graduate';

export interface CardState {
  kanji_id: string;
  direction: Direction;
  status: CardStatus;
  due: number | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last_review: number | null;
  /** '알고있음'을 받은 횟수 */
  pass_count: number;
  /** '공부하겠음'을 받은 횟수 (F8 자동 펼침 기준) */
  study_marks: number;
  favorite: boolean;
  /** FSRS 카드 상태 (0 New, 1 Learning, 2 Review, 3 Relearning). 간격 반복(F5)에서만 바뀐다 */
  fsrs_state: FsrsState;
  /** FSRS 예정 간격(일) */
  scheduled_days: number;
  /** FSRS 학습 단계 위치 */
  learning_steps: number;
}

export type FsrsState = 0 | 1 | 2 | 3;

/** 장별 진행 상태. 회독 도중 이어하기를 위해 현재 회독의 남은 한자 순서를 함께 저장한다. */
export interface ChapterProgress {
  level: number;
  chapter: number;
  /** 끝낸 회독 수 */
  pass_count: number;
  completed_at: number | null;
  /** 현재 회독에서 아직 판정하지 않은 한자 (출제 순서대로) */
  round_queue: string[];
  /** 현재 회독을 시작할 때의 한자 수. 0이면 아직 회독을 시작하지 않음 */
  round_size: number;
}

export type CardOrder = 'shuffle' | 'sequential';

/** 0 이상 1 미만의 난수를 돌려주는 함수 (테스트에서 고정값을 넣는다) */
export type Rng = () => number;
