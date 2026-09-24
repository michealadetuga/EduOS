import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0', port: 5173, allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
