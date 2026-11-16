import { useEffect } from 'react';
import { useSettings } from './useSettings';

/**
 * 화면 설정(theme, kanji_font, kanji_size)을 <html> 속성에 반영한다.
 * 실제 색과 글꼴은 tokens.css가 이 속성을 보고 고른다.
 */
export function useApplyDisplaySettings() {
  const [{ theme, kanji_font, kanji_size }] = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;

    // 브라우저 주소창 색을 현재 바탕색(--paper)에 맞춘다.
    const syncThemeColor = () => {
      const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = paper;
    };
    syncThemeColor();

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', syncThemeColor);
    return () => mq.removeEventListener('change', syncThemeColor);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (kanji_font === 'textbook') delete root.dataset.kanjiFont;
    else root.dataset.kanjiFont = kanji_font;
  }, [kanji_font]);

  useEffect(() => {
    const root = document.documentElement;
    if (kanji_size === 'normal') delete root.dataset.kanjiSize;
    else root.dataset.kanjiSize = kanji_size;
  }, [kanji_size]);
}
