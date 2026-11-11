import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 使用相对路径，便于静态站点部署（子目录亦可）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: process.env.GAME_API_TARGET ?? 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
});
