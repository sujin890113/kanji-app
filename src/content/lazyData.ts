/**
 * 필요할 때만 읽는 콘텐츠 (SPEC 8장 : 앱 시작 시에는 kanji.json만 읽는다)
 * - words.json : 대표 단어 (F9). 처음 필요할 때 한 번
 * - strokes/<코드>.json : 획순 (F10). 한자 상세를 열 때 그 한자만
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

export interface Word {
  id: string;
  text: string;
  reading: string;
  meaning_ko: string | null;
  /** false면 번역 초안 : 화면에 '미검수' 표시 */
  reviewed: boolean;
  level: number;
  kanji: string[];
}

export interface StrokeData {
  size: number;
  /** 획 순서대로의 SVG 경로 */
  strokes: string[];
  /** 획 번호를 놓을 자리 */
  numbers: [number, number][];
}

const base = () => import.meta.env.BASE_URL;

let words: Map<string, Word> | null = null;
let wordsLoading: Promise<void> | null = null;
const wordListeners = new Set<() => void>();

async function loadWords() {
  try {
    const res = await fetch(`${base()}data/words.json`);
    if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
    const list = (await res.json()) as Word[];
    words = new Map(list.map((w) => [w.id, w]));
    wordListeners.forEach((fn) => fn());
  } catch (err) {
    console.warn('단어 데이터를 불러오지 못했습니다', err);
    wordsLoading = null;
  }
}

/** 단어 표. 불러오기 전에는 null */
export function useWords(): Map<string, Word> | null {
  useEffect(() => {
    if (!words && !wordsLoading) wordsLoading = loadWords();
  }, []);
  return useSyncExternalStore(
    (fn) => {
      wordListeners.add(fn);
      return () => wordListeners.delete(fn);
    },
    () => words,
  );
}

const strokeCache = new Map<string, StrokeData>();

export function strokeFile(kanji: string): string {
  return `${base()}data/strokes/${kanji.codePointAt(0)!.toString(16).padStart(5, '0')}.json`;
}

/** 한 한자의 획 데이터. 불러오는 중 undefined, 실패 null */
export function useStrokes(kanji: string): StrokeData | null | undefined {
  const [data, setData] = useState<StrokeData | null | undefined>(() => strokeCache.get(kanji));
  useEffect(() => {
    const hit = strokeCache.get(kanji);
    if (hit) {
      setData(hit);
      return;
    }
    setData(undefined);
    let cancelled = false;
    fetch(strokeFile(kanji))
      .then((r) => (r.ok ? (r.json() as Promise<StrokeData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        strokeCache.set(kanji, d);
        if (!cancelled) setData(d);
      })
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [kanji]);
  return data;
}
