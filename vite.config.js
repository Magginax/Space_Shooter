import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ERROR_PAGE = resolve(import.meta.dirname, 'views/error.html');
const DIST = resolve(import.meta.dirname, 'dist');

/**
 * A page address with no file behind it (e.g. /views/leaderbord.html) gets the
 * error page with status 404, at the same address, like GitHub Pages does with
 * dist/404.html. src/error.js shows "notFound" there.
 */
function notFoundPage(dir, base, render) {
  return async (req, res, next) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.slice(base.length) + (path.endsWith('/') ? 'index.html' : '');
      const isPage = req.headers.accept?.includes('text/html');
      if (!isPage || !path.startsWith(base) || existsSync(resolve(dir, file))) return next();
      const html = await render();
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (error) {
      next(error);
    }
  };
}

// GitHub Pages serves a project site from /<repo-name>/, so the base path
// must match. The deploy workflow sets BASE_PATH; locally it defaults to '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  // Multi-page site: an unknown address is a 404, not index.html.
  appType: 'mpa',
  plugins: [
    {
      name: 'not-found-page',
      // Returned functions run after Vite's own file serving, so only missing pages reach them.
      configureServer(server) {
        return () =>
          server.middlewares.use(
            notFoundPage(server.config.root, server.config.base, () =>
              server.transformIndexHtml('/views/error.html', readFileSync(ERROR_PAGE, 'utf-8')),
            ),
          );
      },
      configurePreviewServer(server) {
        return () =>
          server.middlewares.use(
            notFoundPage(DIST, server.config.base, () => readFileSync(resolve(DIST, '404.html'), 'utf-8')),
          );
      },
      // GitHub Pages shows dist/404.html for every missing address.
      closeBundle() {
        if (existsSync(resolve(DIST, 'views/error.html'))) {
          copyFileSync(resolve(DIST, 'views/error.html'), resolve(DIST, '404.html'));
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    // Every HTML page must be listed, otherwise only index.html gets built.
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        game: resolve(import.meta.dirname, 'views/game.html'),
        leaderboard: resolve(import.meta.dirname, 'views/leaderboard.html'),
        login: resolve(import.meta.dirname, 'views/login.html'),
        error: ERROR_PAGE,
      },
    },
  },
});
