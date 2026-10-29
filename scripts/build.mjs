// Builds the whole site into /dist from content/*.yml and the photos/ folder.
// Run by Cloudflare automatically on every update. Locally: npm run build
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PAPER = '#F6F2EA';
const SIZES = { thumb: [240, 480], page: [640, 960, 1400], large: [2400] };

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (p) => path.relative(ROOT, p);
const paragraphs = (t) => String(t ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p.replace(/\s*\n\s*/g, ' '))}</p>`).join('');

/* ───────────── read content ───────────── */
async function readYaml(file) {
  let text;
  try { text = await fs.readFile(path.join(ROOT, file), 'utf8'); }
  catch { fail(`Can't find ${file}.`); }
  try { return YAML.parse(text); }
  catch (e) { fail(`There's a typing problem in ${file}: ${e.message.split('\n')[0]}\nTip: each line inside a block must start with the same number of spaces, and text containing a colon should be wrapped in "quotes".`); }
}

/* ───────────── colour helpers ───────────── */
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
// Finds the artwork's main colour, then makes a very light tint of the OPPOSITE colour.
async function analyze(buf) {
  const { data } = await sharp(buf).rotate().resize(64, 64, { fit: 'inside' }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const BINS = 24, bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let sr = 0, sg = 0, sb = 0, n = 0, total = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    sr += r; sg += g; sb += b; n++;
    const [h, s, l] = rgbToHsl(r, g, b), wt = s * (1 - Math.abs(2 * l - 1));
    if (wt < 0.08) continue;
    const bin = bins[Math.floor(h * BINS) % BINS];
    bin.w += wt; bin.r += r * wt; bin.g += g * wt; bin.b += b * wt; total += wt;
  }
  const mean = [sr / n, sg / n, sb / n];
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  // Mostly grey / black-and-white art has no meaningful opposite colour: use soft paper.
  if (total / n < 0.04 || best.w === 0) return { dom: hex(mean), bg: PAPER };
  const dom = [best.r / best.w, best.g / best.w, best.b / best.w];
  const [h] = rgbToHsl(...dom);
  return { dom: hex(dom), bg: hex(hslToRgb((h + 0.5) % 1, 0.40, 0.92)) };
}

/* ───────────── images ───────────── */
const written = new Set(), imgCache = new Map();
async function processImage(file, label) {
  if (imgCache.has(file)) return imgCache.get(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.heic' || ext === '.heif') fail(`${rel(file)} is a HEIC photo, which the site can't read.\nSave or export it as a JPEG and upload that instead (and update the file name in the content file).`);
  let buf;
  try { buf = await fs.readFile(file); }
  catch { fail(`Photo not found: ${rel(file)}  (used by ${label}).\nCheck the spelling of the file name and that it was uploaded to the right folder.`); }
  let meta;
  try { meta = await sharp(buf).metadata(); }
  catch { fail(`${rel(file)} could not be read as a photo (used by ${label}). Try saving it again as a JPEG.`); }
  const swap = (meta.orientation || 1) >= 5;
  const W = swap ? meta.height : meta.width, H = swap ? meta.width : meta.height;
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  const base = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photo';
  const make = async (w, q) => {
    const width = Math.min(w, W), name = `img/${base}-${width}-${hash}.webp`;
    if (!written.has(name)) {
      await sharp(buf).rotate().resize({ width }).webp({ quality: q }).toFile(path.join(DIST, name));
      written.add(name);
    }
    return { w: width, url: '/' + name };
  };
  const uniq = (arr) => [...new Map(arr.map((v) => [v.w, v])).values()];
  const result = {
    w: W, h: H,
    thumb: uniq(await Promise.all(SIZES.thumb.map((w) => make(w, 78)))),
    page: uniq(await Promise.all(SIZES.page.map((w) => make(w, 80)))),
    large: (await make(SIZES.large[0], 84)).url,
    ...(await analyze(buf)),
  };
  imgCache.set(file, result);
  return result;
}

/* ───────────── HTML pieces ───────────── */
const minCss = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,])\s*/g, '$1').trim();
const minJs = (j) => j.replace(/^\s*\/\/.*$/gm, '').replace(/\n\s*/g, ' ').trim();
const srcset = (list) => list.map((v) => `${v.url} ${v.w}w`).join(', ');
const midOf = (list) => list[Math.min(1, list.length - 1)].url;
const SIZES_MAIN = '(min-width:700px) 664px, calc(100vw - 48px)';

const X_ICON = (stroke, size = 28) => `<svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L22 22 M22 6 L6 22"/></svg>`;

const mainImg = (im, alt, eager) =>
  `<img src="${midOf(im.page)}" srcset="${srcset(im.page)}" sizes="${SIZES_MAIN}" width="${im.w}" height="${im.h}" alt="${esc(alt)}" style="--dom:${im.dom}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const thumbImg = (im, sizes, alt = '') =>
  `<img src="${im.thumb[0].url}" srcset="${srcset(im.thumb)}" sizes="${sizes}" width="${im.w}" height="${im.h}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
const preloadImg = (im) =>
  `<img src="${midOf(im.page)}" srcset="${srcset(im.page)}" sizes="${SIZES_MAIN}" alt="" loading="eager" fetchpriority="low" decoding="async">`;

const VIEWER = `<dialog id="viewer" aria-label="Photo viewer"><div class="vbar"><span data-hint>Tap photo to zoom in</span><button class="vclose" type="button" data-vclose aria-label="Close photo">${X_ICON('#2B2B2B')}</button></div><div class="vscroll"><img alt=""></div></dialog>`;

async function main() {
  const site = (await readYaml('content/site.yml')) || {};
  const artworks = (await readYaml('content/artworks.yml')) || [];
  if (!Array.isArray(artworks) || artworks.length === 0) fail('content/artworks.yml has no artworks. Add at least one block that starts with "- id:".');
  const siteUrl = String(site.url || '').replace(/\/+$/, '');
  const artist = String(site.artist || 'Artist Name');

  // Validate
  const seen = new Set();
  artworks.forEach((a, i) => {
    const where = `artwork #${i + 1}${a?.title ? ` ("${a.title}")` : ''} in content/artworks.yml`;
    if (!a || typeof a !== 'object') fail(`${where} is not filled in correctly.`);
    if (!a.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(a.id))) fail(`The id of ${where} must use only lowercase letters, numbers and dashes (for example: lake-at-dawn).`);
    if (seen.has(String(a.id))) fail(`The id "${a.id}" is used twice in content/artworks.yml. Every piece needs its own id.`);
    seen.add(String(a.id));
    if (!a.title) fail(`${where} is missing a title.`);
    if (!a.photo) fail(`${where} is missing a photo file name.`);
    (a.extras || []).forEach((x, j) => { if (!x?.photo) fail(`Extra photo #${j + 1} of ${where} is missing a photo file name.`); });
  });

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(path.join(DIST, 'img'), { recursive: true });
  await fs.mkdir(path.join(DIST, 'fonts'), { recursive: true });

  // Fonts (self-hosted so nothing slow loads from elsewhere)
  const fontDir = path.join(ROOT, 'node_modules/@fontsource/atkinson-hyperlegible/files');
  for (const w of [400, 700]) await fs.copyFile(path.join(fontDir, `atkinson-hyperlegible-latin-${w}-normal.woff2`), path.join(DIST, `fonts/atkinson-${w}.woff2`));

  // Images
  for (const a of artworks) {
    a.id = String(a.id);
    a.img = await processImage(path.join(ROOT, 'photos/artworks', String(a.photo)), `"${a.title}"`);
    a.bgColor = a.background || a.img.bg;
    a.extras = a.extras || [];
    for (const x of a.extras) x.img = await processImage(path.join(ROOT, 'photos/extras', String(x.photo)), `an extra photo of "${a.title}"`);
  }
  const about = site.about_photo ? await processImage(path.join(ROOT, 'photos', String(site.about_photo)), 'the About page') : null;

  const css = minCss(await fs.readFile(path.join(ROOT, 'src/style.css'), 'utf8'));
  const js = minJs(await fs.readFile(path.join(ROOT, 'src/site.js'), 'utf8'));
  const fontCss = [400, 700].map((w) => `@font-face{font-family:'Atkinson Hyperlegible';font-weight:${w};font-display:swap;src:url(/fonts/atkinson-${w}.woff2) format('woff2')}`).join('');

  const out = async (rel_, html) => {
    const file = path.join(DIST, rel_);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, html);
  };

  const page = ({ title, desc, bg, body, art, canonical, ogImage, head = '', viewer = false }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}<meta name="theme-color" content="${bg}">
${canonical && siteUrl ? `<link rel="canonical" href="${siteUrl}${canonical}">` : ''}
${siteUrl ? `<meta property="og:title" content="${esc(title)}"><meta property="og:type" content="website">${ogImage ? `<meta property="og:image" content="${siteUrl}${ogImage}">` : ''}` : ''}
<link rel="preload" href="/fonts/atkinson-400.woff2" as="font" type="font/woff2" crossorigin>
<style>${fontCss}:root{--bg:${bg}}${css}</style>${head}
</head><body class="${art ? 'art' : ''}"${art ? ` data-art="${art}"` : ''}>
${body}
${viewer ? VIEWER : ''}<script>${js}</script></body></html>`;

  const header = (label, href, nav) => `<header class="top wrap"><div><div class="name">${esc(artist)}</div><a class="nav" href="${href}" data-nav="${nav}">${label}</a></div><a class="btn" href="/gallery/">Gallery</a></header>`;
  const paras = (t) => `<div class="desc">${paragraphs(t)}</div>`;

  const strip = (a, current) => a.extras.length === 0 ? '' : `<div class="strip"><p class="strip-label">More about this piece</p><ul class="thumbs">${a.extras.map((x, j) =>
    `<li><a class="thumb" href="/art/${a.id}/${j + 1}/" aria-label="${esc(x.kind || 'Photo')}, photo ${j + 1} of ${a.extras.length}"${current === j ? ' aria-current="page"' : ''} style="--dom:${x.img.dom}">${thumbImg(x.img, '96px')}</a></li>`).join('')}</ul></div>`;

  const bar = (innerStrip, backHref, nextHref) => `<footer class="bar"><div class="wrap">${innerStrip}<nav class="pager" aria-label="Previous and next"><a class="btn" href="${backHref}" rel="prev">← Back</a><a class="btn solid" href="${nextHref}" rel="next">Next →</a></nav></div></footer>`;

  const N = artworks.length;
  const artHref = (a) => `/art/${a.id}/`;

  // Artwork pages + extra-photo pages
  for (let i = 0; i < N; i++) {
    const a = artworks[i], prev = artworks[(i - 1 + N) % N], next = artworks[(i + 1) % N];
    const alt = a.alt || a.title;
    const head = N > 1 ? `\n<link rel="prefetch" href="${artHref(next)}"><link rel="prefetch" href="${artHref(prev)}">` : '';
    const preload = N > 1 ? `<div hidden>${preloadImg(next.img)}${prev === next ? '' : preloadImg(prev.img)}</div>` : '';
    const body = `${header('ABOUT', '/about/', 'about')}
<main class="wrap"><a class="photo" href="${a.img.large}" data-large="${a.img.large}" aria-label="Enlarge photo: ${esc(alt)}">${mainImg(a.img, alt, true)}</a>
<p class="meta">${i + 1} of ${N} · Tap photo to enlarge</p>
<h1>${esc(a.title)}</h1>${a.completed ? `<p class="sub">Completed ${esc(a.completed)}</p>` : ''}
${paras(a.description)}</main>
${bar(strip(a, -1), artHref(prev), artHref(next))}${preload}`;
    const html = page({ title: `${a.title} · ${artist}`, desc: String(a.description || '').slice(0, 160), bg: a.bgColor, body, art: artHref(a), canonical: artHref(a), ogImage: a.img.page[a.img.page.length - 1].url, head, viewer: true });
    await out(`art/${a.id}/index.html`, html);
    if (i === 0) await out('index.html', html);

    const M = a.extras.length;
    for (let j = 0; j < M; j++) {
      const x = a.extras[j], xalt = x.alt || x.title || x.kind || a.title;
      const pj = (j - 1 + M) % M, nj = (j + 1) % M;
      const xbody = `${header('ABOUT', '/about/', 'about')}
<main class="wrap"><a class="back" href="${artHref(a)}">← Return to ${esc(a.title)}</a>
<a class="photo" href="${x.img.large}" data-large="${x.img.large}" aria-label="Enlarge photo: ${esc(xalt)}">${mainImg(x.img, xalt, true)}</a>
<p class="meta">${j + 1} of ${M} · Tap photo to enlarge</p>
<h1>${esc(x.title || x.kind || a.title)}</h1>${x.kind ? `<p class="sub">${esc(x.kind)}</p>` : ''}
${paras(x.description)}</main>
${bar(strip(a, j), `/art/${a.id}/${pj + 1}/`, `/art/${a.id}/${nj + 1}/`)}`;
      await out(`art/${a.id}/${j + 1}/index.html`, page({ title: `${x.title || x.kind} · ${a.title} · ${artist}`, desc: String(x.description || '').slice(0, 160), bg: a.bgColor, body: xbody, art: artHref(a), canonical: `/art/${a.id}/${j + 1}/`, ogImage: x.img.page[x.img.page.length - 1].url, viewer: true }));
    }
  }

  // About
  const byline = [site.location, site.medium].filter(Boolean).map(esc).join(' · ');
  const aboutBody = `${header('HOME', '/', 'home')}
<main class="wrap"><h1>About ${esc(artist)}</h1>${byline ? `<p class="byline">${byline}</p>` : ''}
<div class="article">${about ? `<figure style="--dom:${about.dom}">${thumbImg(about, '(min-width:700px) 220px, 120px', `Photo of ${artist}`)}</figure>` : ''}${paragraphs(site.bio)}</div></main>
<footer class="bar"><div class="wrap"><div class="pager"><a class="btn solid" href="/" data-nav="home">Back to the artwork</a></div></div></footer>`;
  await out('about/index.html', page({ title: `About · ${artist}`, desc: `About ${artist}`, bg: PAPER, body: aboutBody, canonical: '/about/' }));

  // Gallery
  const tiles = artworks.map((a) => `<li><a class="tile" href="${artHref(a)}" data-path="${artHref(a)}" style="--dom:${a.img.dom}"><span class="img">${thumbImg(a.img, '(min-width:700px) 220px, 45vw', a.alt || a.title)}</span><span class="t">${esc(a.title)}</span></a></li>`).join('');
  await out('gallery/index.html', page({ title: `Gallery · ${artist}`, desc: `All artwork by ${artist}`, bg: PAPER, canonical: '/gallery/',
    body: `<header class="ghead wrap"><h1>Gallery</h1><a class="close" href="/" data-close aria-label="Close gallery">${X_ICON('#F6F2EA')}</a></header>\n<main class="wrap"><ul class="grid">${tiles}</ul></main>` }));

  // 404 + hosting files
  await out('404.html', page({ title: `Page not found · ${artist}`, bg: PAPER, body: `${header('HOME', '/', 'home')}<main class="wrap"><h1>Page not found</h1><p>That page doesn’t exist. <a href="/">Go to the home page</a>.</p></main>` }));
  await out('_headers', `/img/*\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
  if (siteUrl) {
    const urls = ['/', '/about/', '/gallery/', ...artworks.flatMap((a) => [artHref(a), ...a.extras.map((_, j) => `/art/${a.id}/${j + 1}/`)])];
    await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${siteUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
    await out('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  }

  const X = artworks.reduce((n, a) => n + a.extras.length, 0);
  console.log(`\n✔ Built ${N} artwork${N === 1 ? '' : 's'}, ${X} extra photo${X === 1 ? '' : 's'} and ${written.size} image files into /dist\n`);
}

main().catch((e) => {
  if (e instanceof UserError) { console.error(`\n✖ ${e.message}\n`); process.exit(1); }
  console.error(e); process.exit(1);
});
