/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // GitHub Pages 등 하위 경로에 올려도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [react()],
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
