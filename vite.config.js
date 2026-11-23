import { defineConfig } from 'vite';

// GitHub Pages 部署在 /dusk-pine-cabin/ 子路径下，本地开发仍用根路径
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  build: {
    chunkSizeWarningLimit: 900,
  },
});
