import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(),tailwindcss()],
  build: {
    outDir: 'dist',
  },
  base: '/',
  server: {
    https: {
      key: fs.readFileSync('ssl/192.168.1.3+3-key.pem'),
      cert: fs.readFileSync('ssl/192.168.1.3+3.pem'),
    },

    // host: '192.168.1.3',
    // host:'0.0.0.0',
    host: true,
    port: 5173,
  }
});

