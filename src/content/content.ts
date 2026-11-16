/**
 * 콘텐츠 JSON 로더 (SPEC 8장 : 앱 시작 시 kanji.json만 읽는다)
 * 불러온 뒤에는 메모리에 두고 급수·장 목록을 계산해 둔다.
 */

import { useSyncExternalStore } from 'react';
import { chunkIds, sortLevels, type LevelOutline } from '../domain/progress';

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
  chapter_size?: number;
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
  /** 급수별 한자 (급수 안 순번 순서). 장 크기와 상관없음 */
  levelIds: { level: number; ids: string[] }[];
  /** 장 크기(chapter_size)에 따라 나눈 급수·장 */
  chapterSize: number;
  levels: Level[];
  outline: LevelOutline[];
  /** 한자 → 그 한자가 속한 장 */
  chapterOf: Map<string, Chapter>;
  /** 모든 장 (급수 순서, 장 순서) */
  chapters: Chapter[];
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
  const grouped = new Map<number, Kanji[]>();
  for (const k of list) {
    const arr = grouped.get(k.level) ?? [];
    arr.push(k);
    grouped.set(k.level, arr);
  }
  // 급수 안 순서 : 빌드 시 장 → 장 안 순번 (빌드 장 크기와 상관없이 전체 순번이 된다)
  const levelIds = sortLevels(
    [...grouped.entries()].map(([level, arr]) => ({
      level,
      ids: arr.sort((a, b) => a.chapter - b.chapter || a.order - b.order).map((k) => k.id),
    })),
  );
  return withChapterSize({ byId, levelIds, meta } as Content, meta.chapter_size ?? 20);
}

const chunkCache = new WeakMap<object, Map<number, Content>>();

/** 장 크기(chapter_size, SPEC 7.3)에 맞춰 장 경계를 다시 계산한 콘텐츠. 같은 크기는 한 번만 계산한다 */
export function withChapterSize(content: Content, size: number): Content {
  if (content.chapterSize === size) return content;
  const key = content.levelIds;
  const cache = chunkCache.get(key) ?? new Map<number, Content>();
  chunkCache.set(key, cache);
  const hit = cache.get(size);
  if (hit) return hit;

  const levels: Level[] = content.levelIds.map(({ level, ids }) => ({
    level,
    count: ids.length,
    chapters: chunkIds(ids, size).map((chIds, i) => ({ level, chapter: i + 1, ids: chIds })),
  }));
  const chapters = levels.flatMap((l) => l.chapters);
  const chapterOf = new Map<string, Chapter>();
  for (const ch of chapters) for (const id of ch.ids) chapterOf.set(id, ch);
  const next: Content = {
    byId: content.byId,
    levelIds: content.levelIds,
    meta: content.meta,
    chapterSize: size,
    levels,
    outline: levels.map((l) => ({ level: l.level, chapters: l.chapters.length })),
    chapters,
    chapterOf,
  };
  cache.set(size, next);
  return next;
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
