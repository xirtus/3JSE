// Temporal pop metric between two frames of the same framing a fraction of a
// second apart: how much foam appears ABRUPTLY (dark water -> bright foam in
// one step) versus gradually.
//
//   node tools/framediff.mjs a.png b.png
//
// Reports: pop (L<130 -> L>190), newFoam (L crossing 150 upward), their ratio
// (pop share of all new foam — the abruptness number), and the same downward.
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const [fa, fb] = process.argv.slice(2);
const b = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const p = await b.newPage();
const [da, db] = await Promise.all([readFile(fa), readFile(fb)]);
const r = await p.evaluate(async (ua, ub) => {
  let imgW = 0;
  const load = async (u) => {
    const i = new Image(); i.src = u; await i.decode();
    imgW = i.width;
    const c = Object.assign(document.createElement('canvas'), { width: i.width, height: i.height });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(i, 0, 0);
    return g.getImageData(0, 0, i.width, i.height).data;
  };
  const A = await load(ua); const B = await load(ub);
  // luminance planes for the isolation test
  const W = (() => { let w = 0; return { set v(x) { w = x; }, get v() { return w; } }; })();
  const width = Math.sqrt(A.length / 4) | 0; // frames are 16:9, recompute below
  const La = new Float32Array(A.length / 4);
  const Lb = new Float32Array(A.length / 4);
  for (let i = 0; i < La.length; i++) {
    La[i] = 0.2126 * A[i * 4] + 0.7152 * A[i * 4 + 1] + 0.0722 * A[i * 4 + 2];
    Lb[i] = 0.2126 * B[i * 4] + 0.7152 * B[i * 4 + 1] + 0.0722 * B[i * 4 + 2];
  }
  const w = imgW, h = La.length / imgW;
  let pop = 0, newFoam = 0, gone = 0, drop = 0, n = La.length, births = 0;
  const R = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const la = La[i], lb = Lb[i];
      if (la < 150 && lb > 150) {
        newFoam++;
        if (la < 130 && lb > 190) {
          pop++;
          // a BIRTH is a pop with no bright pixel nearby in the earlier
          // frame — travelling edges of existing foam are excluded
          let iso = true;
          for (let dy = -R; dy <= R && iso; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= w) continue;
              if (La[yy * w + xx] > 150) { iso = false; break; }
            }
          }
          if (iso) births++;
        }
      }
      if (la > 150 && lb < 150) { gone++; if (la > 190 && lb < 130) drop++; }
    }
  }
  return { n, pop, newFoam, gone, drop, births };
}, `data:image/png;base64,${da.toString('base64')}`, `data:image/png;base64,${db.toString('base64')}`);
await b.close();
console.log(JSON.stringify({
  ...r,
  popPctOfNew: r.newFoam ? +(100 * r.pop / r.newFoam).toFixed(1) : 0,
  dropPctOfGone: r.gone ? +(100 * r.drop / r.gone).toFixed(1) : 0,
}));
