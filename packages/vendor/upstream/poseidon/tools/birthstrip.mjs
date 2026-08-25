// Find where foam is BORN across a burst of frames and stitch that region into
// one horizontal filmstrip, so onset behaviour is reviewable from stills.
//
//   node tools/birthstrip.mjs out.png f0.png f1.png ... fN.png
//
// Picks the 96x96 block with the largest luminance GAIN between the first and
// last frame that was dark in the first (a birth, not a travelling edge), then
// crops that block from every frame at 3x.
import { launch } from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const [out, ...frames] = process.argv.slice(2);
const b = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const p = await b.newPage();
const datas = await Promise.all(frames.map(async (f) => (await readFile(f)).toString('base64')));
const png = await p.evaluate(async (imgs) => {
  const load = async (u) => { const i = new Image(); i.src = 'data:image/png;base64,' + u; await i.decode(); return i; };
  const ims = await Promise.all(imgs.map(load));
  const W = ims[0].width, H = ims[0].height, B = 96;
  const lum = (im) => {
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    return L;
  };
  const L0 = lum(ims[0]); const LN = lum(ims[ims.length - 1]);
  let best = { s: -1, x: 0, y: 0 };
  for (let by = 0; by + B <= H; by += B / 2) {
    for (let bx = 0; bx + B <= W; bx += B / 2) {
      let s = 0;
      for (let y = by; y < by + B; y += 2) {
        for (let x = bx; x < bx + B; x += 2) {
          const i = y * W + x;
          // gain over dark start only: births, not travelling bright edges
          if (L0[i] < 120) s += Math.max(LN[i] - L0[i], 0);
        }
      }
      if (s > best.s) best = { s, x: bx, y: by };
    }
  }
  const S = 3, pad = 4;
  const cv = Object.assign(document.createElement('canvas'), {
    width: ims.length * (B * S + pad) - pad, height: B * S,
  });
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  ims.forEach((im, i) => g.drawImage(im, best.x, best.y, B, B, i * (B * S + pad), 0, B * S, B * S));
  return cv.toDataURL('image/png');
}, datas);
await writeFile(out, Buffer.from(png.split(',')[1], 'base64'));
await b.close();
console.log('wrote', out);
