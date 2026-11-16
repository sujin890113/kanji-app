/**
 * 앱에 포함한 글꼴과 라이브러리 (S8 7.6 정보). 데이터 출처는 meta.json의 sources에서 읽는다.
 * 라이선스는 각 패키지의 package.json에서 확인한 값.
 */
export interface Credit {
  name: string;
  license: string;
  url: string;
}

export const FONT_CREDITS: Credit[] = [
  { name: 'Klee One (Fontworks)', license: 'SIL OFL 1.1', url: 'https://github.com/fontworks-fonts/Klee' },
  { name: 'Noto Serif JP · Noto Sans JP · Noto Serif KR (Google)', license: 'SIL OFL 1.1', url: 'https://fonts.google.com/noto' },
  { name: 'Pretendard (길형진)', license: 'SIL OFL 1.1', url: 'https://github.com/orioncactus/pretendard' },
];

export const LIBRARY_CREDITS: Credit[] = [
  { name: 'ts-fsrs', license: 'MIT', url: 'https://github.com/open-spaced-repetition/ts-fsrs' },
  { name: 'Dexie.js', license: 'Apache-2.0', url: 'https://github.com/dexie/Dexie.js' },
  { name: 'React · React Router', license: 'MIT', url: 'https://react.dev' },
  { name: 'Workbox (vite-plugin-pwa)', license: 'MIT', url: 'https://github.com/GoogleChrome/workbox' },
];
