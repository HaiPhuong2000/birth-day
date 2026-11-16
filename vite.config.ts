import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The Cloudflare Pages project name lives in package.json ("config.pagesProject") and is used
// both by `npm run deploy` and to build the absolute og:image URL (link previews need one).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { config: { pagesProject: string } };
const siteUrl = `https://${pkg.config.pagesProject}.pages.dev`;

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
  ],
  build: {
    // Phaser alone is ~1.2MB minified; it is the intended payload.
    chunkSizeWarningLimit: 1500,
  },
});
