/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // GitHub Pages 등 하위 경로에 올려도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [
    react(),
    // 설치형 웹앱 (SPEC 8장, M7) : 홈 화면 설치와 오프라인 동작
    VitePWA({
      // 새 버전은 사용자가 [새로 고침]을 눌러야 적용한다 (학습 도중에 화면이 바뀌지 않게)
      registerType: 'prompt',
      injectRegister: null,
      // 아이콘은 아래 globPatterns(png)로 이미 들어간다
      includeManifestIcons: false,
      manifest: {
        name: '상용한자',
        short_name: '상용한자',
        description: '한국어 화자를 위한 일본 상용한자 학습',
        lang: 'ko',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        // tokens.css의 --paper(라이트)와 같은 색
        background_color: '#f6f1e7',
        theme_color: '#f6f1e7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱, 글꼴(woff2), 한자 데이터와 획순 전부를 미리 받아 둔다 (약 30MB). woff는 woff2를 못 읽는 옛 브라우저용이라 뺀다
        globPatterns: ['**/*.{js,css,html,woff2,json,png}'],
        globIgnores: ['**/*.woff'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // 주소는 # 방식이라 첫 화면 문서 하나면 된다
        navigateFallback: 'index.html',
      },
    }),
  ],
  // 설정 > 정보에 표시할 앱 버전
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
