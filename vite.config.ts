/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 등 하위 경로에 올려도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
