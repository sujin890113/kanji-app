import { useSyncExternalStore } from 'react';
import { getSettings, setSetting, subscribeSettings } from './store';

/** 화면에서 설정 값을 읽고 바꾸는 훅 */
export function useSettings() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  return [settings, setSetting] as const;
}
