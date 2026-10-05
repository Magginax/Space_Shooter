import { defineConfig } from 'vite';

// GitHub Pages serves a project site from /<repo-name>/, so the base path
// must match. The deploy workflow sets BASE_PATH; locally it defaults to '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    outDir: 'dist',
  },
});
