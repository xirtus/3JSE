// Deterministic screenshots of the ocean, for visual review loops.
//
//   node tools/shot.mjs --out shots/a --presets deck,swell,sun --t 40
//   node tools/shot.mjs --out shots/calm --p '{"local":{"windSpeed":6}}'
//
// Launches system Chrome headless with WebGPU on, loads the vite dev server in
// capture mode (see src/util/capture.js), waits for window.__shotReady, saves a
// PNG per preset. Safe to run several at once — each gets its own browser.
import { launch } from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found — set CHROME_PATH');

const { values: a } = parseArgs({
  options: {
    out: { type: 'string', default: 'shots/out' },
    presets: { type: 'string', default: 'deck,swell,trough,sun,aerial' },
    t: { type: 'string', default: '40' }, // sim seconds before the frame is taken
    p: { type: 'string', default: '' }, // params overrides, JSON — see capture.js
    url: { type: 'string', default: 'http://localhost:5173' },
    w: { type: 'string', default: '1600' },
    h: { type: 'string', default: '900' },
    fmt: { type: 'string', default: 'png' }, // png | jpeg — jpeg for README-sized files
    q: { type: 'string', default: '90' }, // jpeg quality
  },
});

const out = resolve(a.out);
const presets = a.presets.split(',');
const { t, p: overrides, url: base } = a;
const width = Number(a.w);
const height = Number(a.h);

await mkdir(dirname(out + '/x'), { recursive: true });

// Find the dev server actually serving THIS project. A stale port is not a
// harmless mistake: another vite on 5173 once served an unrelated demo, and
// screenshots of it look like a perfectly valid render of something else, so a
// whole review pass can be spent judging the wrong page. Verified by title.
const TITLE = 'FFT Ocean';
async function servesOcean(u) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(2500) });
    return r.ok && (await r.text()).includes(TITLE);
  } catch { return false; }
}
async function resolveBase(preferred) {
  if (await servesOcean(preferred)) return preferred;
  const { port, protocol, hostname } = new URL(preferred);
  for (let p = 5173; p <= 5199; p++) {
    const cand = `${protocol}//${hostname}:${p}`;
    if (p !== Number(port) && await servesOcean(cand)) {
      console.error(`[shot] ${preferred} is not this project; using ${cand}`);
      return cand;
    }
  }
  throw new Error(`No dev server serving "${TITLE}" found on ${hostname}:5173-5199. Start one with: npx vite`);
}
const baseUrl = await resolveBase(base);

const browser = await launch({
  executablePath: process.env.CHROME_PATH ?? CHROME,
  headless: true,
  args: [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=default',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
  ],
});

const results = [];
for (const preset of presets) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const url = new URL(baseUrl);
  url.searchParams.set('shot', '1');
  url.searchParams.set('preset', preset);
  url.searchParams.set('t', t);
  if (overrides) url.searchParams.set('p', overrides);

  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  let ok = true;
  try {
    await page.waitForFunction('window.__shotReady === true', { timeout: 180000, polling: 250 });
  } catch {
    ok = false;
    errors.push('timeout waiting for __shotReady');
  }
  const file = `${out}/${preset}.${a.fmt === 'jpeg' ? 'jpg' : 'png'}`;
  await page.screenshot({ path: file, type: a.fmt, ...(a.fmt === 'jpeg' ? { quality: Number(a.q) } : {}) });
  results.push({ preset, file, ok, errors: errors.slice(0, 6) });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
