import { db } from '../db/database';
import { buildSettings, defaultSettings, isValidValue, type SettingKey, type Settings } from './definitions';

/**
 * 설정 저장소.
 * 앱 시작 시 DB에서 한 번 읽어 메모리에 두고, 값을 바꾸면 메모리와 DB를 함께 갱신한다.
 */

let current: Settings = defaultSettings;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export async function loadSettings(): Promise<void> {
  try {
    const rows = await db.settings.toArray();
    current = buildSettings(rows);
  } catch (err) {
    // IndexedDB를 쓸 수 없는 환경(일부 사생활 보호 모드 등)에서는 기본값으로 동작한다.
    console.warn('설정을 불러오지 못해 기본값을 사용합니다.', err);
    current = defaultSettings;
  }
  emit();
}

export function getSettings(): Settings {
  return current;
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
  if (!isValidValue(key, value)) {
    throw new Error(`허용되지 않는 설정 값입니다: ${key}`);
  }
  current = { ...current, [key]: value };
  emit();
  try {
    await db.settings.put({ key, value });
  } catch (err) {
    console.warn('설정을 저장하지 못했습니다.', err);
  }
}
