// Post-build: generate per-route static HTML with correct SEO/OG meta.
// Social scrapers (WhatsApp, Facebook, Twitter) do NOT run JS — they read the
// static <head>. A plain SPA serves the same index.html for every route, so all
// shared pages would expose the homepage's title/OG. This script writes
// dist/<route>/index.html with the route's own meta baked in. Vercel serves the
// filesystem before applying the SPA rewrite, so these files win for real routes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

const pageMeta = JSON.parse(
  readFileSync(join(root, 'src/seo/page-meta.json'), 'utf8')
);

const baseHtml = readFileSync(join(distDir, 'index.html'), 'utf8');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function applyMeta(html, m) {
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`);
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(m.description)}" />`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(m.canonical)}" />`
  );
  // Open Graph
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${esc(m.canonical)}" />`
  );
  out = out.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${esc(m.ogTitle)}" />`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${esc(m.ogDescription)}" />`
  );
  if (m.ogImage) {
    out = out.replace(
      /<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${esc(m.ogImage)}" />`
    );
    out = out.replace(
      /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${esc(m.ogImage)}" />`
    );
  }
  // Twitter
  out = out.replace(
    /<meta name="twitter:url" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:url" content="${esc(m.canonical)}" />`
  );
  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${esc(m.ogTitle)}" />`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${esc(m.ogDescription)}" />`
  );
  return out;
}

let count = 0;
for (const [key, m] of Object.entries(pageMeta)) {
  if (key === 'home') continue; // dist/index.html already carries home meta
  const slug = m.path.replace(/^\//, '');
  const outDir = join(distDir, slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), applyMeta(baseHtml, m), 'utf8');
  count++;
  console.log(`  prerendered  /${slug}  ->  dist/${slug}/index.html`);
}

console.log(`✓ prerender-meta: ${count} route(s) written`);
