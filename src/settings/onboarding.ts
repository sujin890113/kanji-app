import { db } from '../db/database';
import { levelsBefore } from '../domain/progress';

/**
 * 최초 실행 기록 (SPEC 6장 빈 상태 : 최초 실행).
 * 기능 설정(SPEC 7장)이 아니므로 settings 테이블에 따로 둔다. 백업에도 함께 들어간다.
 * - onboarding_done : 안내를 마쳤는가
 * - start_level : 고른 시작 급수 (앞 급수는 완료로 둔다)
 */
const DONE_KEY = 'onboarding_done';
const START_KEY = 'start_level';

let done = true;
let startLevel = 5;

export async function loadOnboarding(): Promise<void> {
  try {
    const [d, s] = await Promise.all([db.settings.get(DONE_KEY), db.settings.get(START_KEY)]);
    startLevel = typeof s?.value === 'number' ? s.value : 5;
    if (d?.value === true) {
      done = true;
    } else {
      // 이 기능 전부터 쓰던 기기 : 학습 기록이 있으면 안내를 건너뛴다
      done = (await db.cards.count()) > 0;
      if (done) await db.settings.put({ key: DONE_KEY, value: true });
    }
  } catch {
    // DB를 쓸 수 없으면 안내를 띄우지 않는다
    done = true;
  }
}

export const isOnboarded = () => done;

/** 시작 급수를 골라 건너뛴 급수 (장 크기 변경 때 완료로 남긴다) */
export const skippedLevels = () => new Set(levelsBefore(startLevel));

export async function finishOnboarding(start: number): Promise<void> {
  startLevel = start;
  await db.settings.bulkPut([
    { key: START_KEY, value: start },
    { key: DONE_KEY, value: true },
  ]);
  done = true;
}

/** 전체 초기화 뒤 : 건너뛴 급수 기록도 지운다 (안내는 다시 띄우지 않는다) */
export async function clearStartLevel(): Promise<void> {
  startLevel = 5;
  await db.settings.delete(START_KEY);
}
