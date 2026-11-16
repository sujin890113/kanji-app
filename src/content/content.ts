/**
 * 콘텐츠 JSON 로더 (SPEC 8장 : 앱 시작 시 kanji.json만 읽는다)
 * 불러온 뒤에는 메모리에 두고 급수·장 목록을 계산해 둔다.
 */

import { useSyncExternalStore } from 'react';
import { sortLevels, type LevelOutline } from '../domain/progress';

export interface HunEum {
  hun: string;
  eum: string;
}

/** kanji.json 한 건 (SPEC 3.2) */
export interface Kanji {
  id: string;
  level: number;
  chapter: number;
  order: number;
  strokes: number;
  on: string[];
  kun: string[];
  ko_main: HunEum | null;
  ko_more: HunEum[];
  ko_form: string | null;
  kokuji: boolean;
  meaning_ko: string | null;
  rules: string[];
  phonetic: string | null;
  similar: string[];
  words: string[];
}

export interface ContentMeta {
  built_at: string;
  count: number;
  aliases: Record<string, string>;
  sources: { attribution: string; license: string; license_url: string; url: string; version: string }[];
}

export interface Chapter {
  level: number;
  chapter: number;
  /** 장 안 순번 순서의 한자 id */
  ids: string[];
}

export interface Level {
  level: number;
  chapters: Chapter[];
  count: number;
}

export interface Content {
  byId: Map<string, Kanji>;
  levels: Level[];
  outline: LevelOutline[];
  meta: ContentMeta;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: Content };

let state: State = { status: 'loading' };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((fn) => fn());
}

export function levelName(level: number): string {
  return level === 0 ? '보충' : `N${level}`;
}

export function getChapter(content: Content, level: number, chapter: number): Chapter | undefined {
  return content.levels.find((l) => l.level === level)?.chapters.find((c) => c.chapter === chapter);
}

function build(list: Kanji[], meta: ContentMeta): Content {
  const byId = new Map(list.map((k) => [k.id, k]));
  const grouped = new Map<number, Map<number, Kanji[]>>();
  for (const k of list) {
    const chapters = grouped.get(k.level) ?? new Map<number, Kanji[]>();
    const arr = chapters.get(k.chapter) ?? [];
    arr.push(k);
    chapters.set(k.chapter, arr);
    grouped.set(k.level, chapters);
  }
  const levels: Level[] = sortLevels(
    [...grouped.entries()].map(([level, chapters]) => ({
      level,
      count: [...chapters.values()].reduce((n, a) => n + a.length, 0),
      chapters: [...chapters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([chapter, arr]) => ({ level, chapter, ids: arr.sort((a, b) => a.order - b.order).map((k) => k.id) })),
    })),
  );
  return { byId, levels, outline: levels.map((l) => ({ level: l.level, chapters: l.chapters.length })), meta };
}

export async function loadContent(): Promise<void> {
  set({ status: 'loading' });
  try {
    const base = import.meta.env.BASE_URL;
    const [kanjiRes, metaRes] = await Promise.all([fetch(`${base}data/kanji.json`), fetch(`${base}data/meta.json`)]);
    if (!kanjiRes.ok || !metaRes.ok) throw new Error(`서버 응답 ${kanjiRes.status}`);
    const list = (await kanjiRes.json()) as Kanji[];
    const meta = (await metaRes.json()) as ContentMeta;
    set({ status: 'ready', content: build(list, meta) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    set({ status: 'error', message: `한자 데이터를 불러오지 못했습니다. (${message})` });
  }
}

export function useContentState(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
