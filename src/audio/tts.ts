/**
 * 발음 음성 (F11, SPEC 2.3). 브라우저에 내장된 음성 합성(Web Speech API)으로 기기의 일본어 음성을 쓴다.
 * 일본어 음성이 없는 기기에서는 useJapaneseVoice()가 'no'가 되어 버튼을 숨긴다.
 */

import { useSyncExternalStore } from 'react';

type VoiceState = 'unknown' | 'yes' | 'no';

let state: VoiceState = 'unknown';
let voice: SpeechSynthesisVoice | null = null;
const listeners = new Set<() => void>();

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function refresh() {
  const s = synth();
  if (!s) {
    state = 'no';
  } else {
    const voices = s.getVoices();
    // 음성 목록은 늦게 채워지는 브라우저가 있다. 비어 있으면 아직 모르는 상태로 둔다
    if (voices.length === 0) return;
    voice = voices.find((v) => v.lang === 'ja-JP') ?? voices.find((v) => v.lang.toLowerCase().startsWith('ja')) ?? null;
    state = voice ? 'yes' : 'no';
  }
  listeners.forEach((fn) => fn());
}

let started = false;
function start() {
  if (started) return;
  started = true;
  const s = synth();
  if (!s) {
    state = 'no';
    return;
  }
  s.addEventListener?.('voiceschanged', refresh);
  refresh();
  // 끝내 목록이 오지 않는 브라우저 : 3초 뒤에도 비어 있으면 '없음'
  setTimeout(() => {
    if (state === 'unknown') {
      state = 'no';
      listeners.forEach((fn) => fn());
    }
  }, 3000);
}

/** 일본어 음성 유무 : 'unknown'(확인 중) / 'yes' / 'no' */
export function useJapaneseVoice(): VoiceState {
  start();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

/** 글을 차례로 읽는다. 앞서 읽던 것은 멈춘다 */
export function speak(texts: readonly string[], rate: 'slow' | 'normal'): void {
  const s = synth();
  if (!s || !voice || texts.length === 0) return;
  s.cancel();
  for (const t of texts) {
    const u = new SpeechSynthesisUtterance(t);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate === 'slow' ? 0.7 : 1;
    s.speak(u);
  }
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
