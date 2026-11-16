/**
 * 판정 피드백 : 진동(haptics)과 효과음(sound_fx) (SPEC 5.6, 7.4).
 * 효과음은 오디오 파일 없이 Web Audio API로 짧은 음을 만든다 (용량·라이선스 없음, 오프라인 동작).
 */

import { getSettings } from '../settings/store';

export type FeedbackKind = 'study' | 'vague' | 'know' | 'graduate' | 'complete';

/** 진동 패턴 (ms). 판정은 짧게 1회, 졸업은 길게 1회, 장 완료는 2회 */
const VIBRATION: Record<FeedbackKind, number | number[]> = {
  study: 15,
  vague: 15,
  know: 15,
  graduate: 80,
  complete: [60, 80, 60],
};

/** 음 : [주파수(Hz), 시작(초), 길이(초)] */
const TONES: Record<FeedbackKind, [number, number, number][]> = {
  study: [[392, 0, 0.12]], // 솔, 낮고 부드럽게
  vague: [[523.25, 0, 0.12]], // 도
  know: [
    [659.25, 0, 0.08], // 미
    [880, 0.07, 0.12], // 라
  ],
  graduate: [
    [659.25, 0, 0.1],
    [880, 0.08, 0.1],
    [1318.5, 0.16, 0.18],
  ],
  complete: [
    [523.25, 0, 0.14],
    [659.25, 0.12, 0.14],
    [783.99, 0.24, 0.26],
  ],
};

const VOLUME = 0.08;

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function play(kind: FeedbackKind) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const [freq, start, dur] of TONES[kind]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // 딸깍 소리가 나지 않게 짧게 올렸다가 내린다
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(VOLUME, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  }
}

/** 설정(진동·효과음)에 따라 피드백을 낸다 */
export function feedback(kind: FeedbackKind) {
  const s = getSettings();
  if (s.haptics) {
    try {
      navigator.vibrate?.(VIBRATION[kind]);
    } catch {
      // 진동을 지원하지 않거나 막힌 기기
    }
  }
  if (s.sound_fx) {
    try {
      play(kind);
    } catch {
      // 오디오를 쓸 수 없는 환경
    }
  }
}
