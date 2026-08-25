// knobAudit.mjs — measure how much each gene actually moves the produced form.
// Dev tool (not part of the app/tests). Run: node scripts/knobAudit.mjs
//
// For each continuous gene: sweep lo→hi with all others at GRASS_DEFAULT and a
// FIXED seed, build the real blade geometry + foliage, and record a feature
// vector. Reports per-gene sensitivity, dead/appearance-only knobs, and
// overlapping (redundant) knob pairs via effect-direction cosine similarity.

import { resolve } from '../src/genome.js';
import { buildBladeGeometry, bladeWidthGeneToWorld } from '../src/bladeMesh.js';
import { GRASS_SCHEMA } from '../src/genomeSchema.js';
import { GRASS_DEFAULT } from '../src/presets.js';

const ENV = { gravity: 1, medium: 'air', light: 0.6, sunAngle: 0.25, wind: 0.2, aridity: 0.35, temperature: 0.5 };
const BASE = { ...GRASS_DEFAULT, structuralSeed: 0x1234ABCD >>> 0 };

// Feature names (geometric + foliage). Cosmetic/shader genes won't move these.
const FEATS = ['W', 'H', 'D', 'V', 'T', 'area', 'fol', 'folAsp'];

function meshOpts(r) {
  return {
    bladeWidth: bladeWidthGeneToWorld(r.bladeWidth), bladeTaper: r.bladeTaper, bladeShape: r.bladeShape,
    widestPos: r.widestPos, crossSectionCurl: r.crossSectionCurl,
    bladeTwist: r.bladeTwist, stemRoundness: r.stemRoundness, midribStrength: r.midribStrength,
    bladeRaggedness: r.bladeRaggedness,
  };
}

function features(genome) {
  const r = resolve(genome, ENV);
  const g = buildBladeGeometry(r.graph, meshOpts(r));
  const W = g.bounds.max[0] - g.bounds.min[0];
  const H = g.bounds.max[1] - g.bounds.min[1];
  const D = g.bounds.max[2] - g.bounds.min[2];
  let area = 0;
  const p = g.positions, idx = g.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  let folAsp = 0;
  for (let i = 0; i < r.foliage.count; i++) folAsp = Math.max(folAsp, r.foliage.aspect ? r.foliage.aspect[i] : 1);
  return { W, H, D, V: g.vertexCount, T: g.triangleCount, area, fol: r.foliage.count, folAsp };
}

const SAMPLES = [0, 0.25, 0.5, 0.75, 1.0];
const genes = Object.keys(GRASS_SCHEMA).filter(k => GRASS_SCHEMA[k].kind === 'continuous');

const base = features(BASE);
console.log('BASELINE (GRASS_DEFAULT):', Object.fromEntries(FEATS.map(f => [f, +base[f].toFixed(4)])));
console.log('');

// scale per feature for normalization (use baseline magnitude, floored)
const scale = {};
for (const f of FEATS) scale[f] = Math.max(Math.abs(base[f]), f === 'fol' ? 1 : (f === 'folAsp' ? 1 : 1e-3));

const rows = [];
const effectDir = {}; // gene -> normalized (hi - lo) feature vector for redundancy

for (const gene of genes) {
  const [lo, hi] = GRASS_SCHEMA[gene].range;
  const vecs = SAMPLES.map(s => features({ ...BASE, [gene]: lo + s * (hi - lo) }));
  // sensitivity per feature = (max-min)/scale across the sweep
  const sens = {};
  for (const f of FEATS) {
    let mn = Infinity, mx = -Infinity;
    for (const v of vecs) { mn = Math.min(mn, v[f]); mx = Math.max(mx, v[f]); }
    sens[f] = (mx - mn) / scale[f];
  }
  const total = FEATS.reduce((a, f) => a + sens[f], 0);
  rows.push({ gene, total, sens, loV: vecs[0], hiV: vecs[vecs.length - 1] });
  // effect direction (hi-lo), normalized over geometric feats only
  const geo = ['W', 'H', 'D', 'V', 'T', 'area', 'fol'];
  const d = geo.map(f => (vecs[vecs.length - 1][f] - vecs[0][f]) / scale[f]);
  const mag = Math.sqrt(d.reduce((a, x) => a + x * x, 0)) || 1;
  effectDir[gene] = d.map(x => x / mag);
}

rows.sort((a, b) => b.total - a.total);

console.log('PER-GENE SENSITIVITY (normalized Δ across lo→hi; bigger = moves the form more)');
console.log('gene'.padEnd(18), 'total'.padStart(7), '  ', FEATS.map(f => f.padStart(7)).join(' '));
for (const r of rows) {
  console.log(
    r.gene.padEnd(18),
    r.total.toFixed(2).padStart(7), '  ',
    FEATS.map(f => r.sens[f].toFixed(2).padStart(7)).join(' ')
  );
}

console.log('');
console.log('DEAD / APPEARANCE-ONLY (no geometric effect — total ~0):');
console.log('  ' + rows.filter(r => r.total < 0.02).map(r => r.gene).join(', '));

console.log('');
console.log('REDUNDANT PAIRS (effect-direction cosine > 0.92 among genes that DO move geometry):');
const movers = rows.filter(r => r.total >= 0.05).map(r => r.gene);
const seen = new Set();
for (let i = 0; i < movers.length; i++) {
  for (let j = i + 1; j < movers.length; j++) {
    const a = effectDir[movers[i]], b = effectDir[movers[j]];
    const cos = a.reduce((s, x, k) => s + x * b[k], 0);
    if (cos > 0.92) console.log('  ' + movers[i].padEnd(18) + ' ~ ' + movers[j].padEnd(18) + ' cos=' + cos.toFixed(3));
  }
}

console.log('');
console.log('KEY RANGE CHECKS (actual world-unit extents at gene extremes):');
function worldAt(over) {
  const f = features({ ...BASE, ...over });
  return f;
}
const bwLo = worldAt({ bladeWidth: 0 }), bwHi = worldAt({ bladeWidth: 1 });
console.log(`  bladeWidth 0→1: blade bbox width ${bwLo.W.toFixed(3)} → ${bwHi.W.toFixed(3)} m (clump). area ${bwLo.area.toFixed(4)} → ${bwHi.area.toFixed(4)}`);
const blLo = worldAt({ bladeLength: 0 }), blHi = worldAt({ bladeLength: 1 });
console.log(`  bladeLength 0→1: blade bbox height ${blLo.H.toFixed(3)} → ${blHi.H.toFixed(3)} m`);
