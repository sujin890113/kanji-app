/**
 * 관계 데이터 (F3 음 대응 규칙, F4 음부 묶음). kanji.json과 따로 두고 처음 필요할 때 한 번 읽는다.
 * 유사 한자(F8)는 kanji.json의 similar에 들어 있어 따로 읽지 않는다.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { SoundRule } from '../domain/soundRules';

export interface PhoneticGroup {
  id: string;
  component: string;
  reading: string;
  members: string[];
}

export interface Relations {
  rules: Map<string, SoundRule>;
  groups: Map<string, PhoneticGroup>;
}

let relations: Relations | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  try {
    const [r, g] = await Promise.all([fetch(`${base}data/sound_rules.json`), fetch(`${base}data/phonetic_groups.json`)]);
    if (!r.ok || !g.ok) throw new Error(`서버 응답 ${r.status}/${g.status}`);
    const rules = ((await r.json()) as { rules: SoundRule[] }).rules;
    const groups = (await g.json()) as PhoneticGroup[];
    relations = { rules: new Map(rules.map((x) => [x.id, x])), groups: new Map(groups.map((x) => [x.id, x])) };
    listeners.forEach((fn) => fn());
  } catch (err) {
    // 관계 데이터가 없어도 카드는 쓸 수 있다. 해당 구역만 표시하지 않는다
    console.warn('관계 데이터를 불러오지 못했습니다', err);
    loading = null;
  }
}

/** 음 대응 규칙과 음부 묶음. 불러오기 전에는 null */
export function useRelations(): Relations | null {
  useEffect(() => {
    if (!relations && !loading) loading = load();
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => relations,
  );
}
