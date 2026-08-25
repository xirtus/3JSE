// Whitecap coverage calibration sweep — the acceptance test from
// docs/foam-research.md. For each wind speed: render the foam-structure
// debug view from the aerial framing, measure covered area at a strict
// (active caps) and a permissive (all foam) threshold, and compare against
// the published laws:
//   MOM80 total:  W = 3.84e-6 * U10^3.41          (Monahan & O'Muircheartaigh)
//   active caps:  ~0.5 * W, capped at 4%           (stage A share; Holthuijsen ceiling)
// Real coverage at fixed wind scatters by an order of magnitude, so the
// honest pass criterion is "within ~3x of the curve", not equality.
//
//   node tools/calibrate.mjs            # default winds
//   node tools/calibrate.mjs 8 12 22    # specific winds
import { execFileSync } from 'node:child_process';

const winds = process.argv.slice(2).map(Number).filter(Boolean);
const U = winds.length ? winds : [5, 7, 10, 13, 17, 20];

const mom80 = (u) => 3.84e-6 * Math.pow(u, 3.41);
const rows = [];
for (const u of U) {
  const out = `shots/calibrate-w${u}`;
  const p = JSON.stringify({ local: { windSpeed: u }, foamTrail: 0.6, foamDecay: 6, foamDebug: 1 });
  execFileSync('node', ['tools/shot.mjs', '--out', out, '--presets', 'aerial', '--t', '40', '--p', p], { stdio: 'pipe' });
  const probe = execFileSync('node', ['tools/foamprobe.mjs', '--mode', 'area', `${out}/aerial.png`], { encoding: 'utf8' });
  const m = JSON.parse(probe.slice(probe.indexOf('{')));
  const total = mom80(u);
  const active = Math.min(0.5 * total, 0.04);
  rows.push({
    'U10 m/s': u,
    'measured total %': (m.area_gt15 * 100).toFixed(2),
    'MOM80 total %': (total * 100).toFixed(2),
    'measured active %': (m.area_gt30 * 100).toFixed(2),
    'target active %': (active * 100).toFixed(2),
    'ratio(total)': (m.area_gt15 / Math.max(total, 1e-6)).toFixed(2),
  });
}
console.table(rows);
const worst = Math.max(...rows.map((r) => Math.max(r['ratio(total)'], 1 / r['ratio(total)'])));
console.log(worst <= 3 ? `PASS — every wind within 3x of MOM80 (worst ${worst.toFixed(2)}x)` :
  `FAIL — worst deviation ${worst.toFixed(2)}x exceeds the 3x scatter band`);
