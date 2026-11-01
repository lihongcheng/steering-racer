import { defineConfig } from 'vite';
export default defineConfig({ root: 'src/game', base: '/game/', publicDir: false,
  build: { outDir: '../../public/game', emptyOutDir: true, target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 }
});
