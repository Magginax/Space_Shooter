import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// GitHub Pages serves a project site from /<repo-name>/, so the base path
// must match. The deploy workflow sets BASE_PATH; locally it defaults to '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    outDir: 'dist',
    // Every HTML page must be listed, otherwise only index.html gets built.
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        leaderboard: resolve(import.meta.dirname, 'leaderboard.html'),
      },
    },
  },
});
