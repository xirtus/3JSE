import { randomGenome, resolve, computeColorAxes } from './genome.js';
import { createViewer }                   from './viewer.js';
import { createRenderModeController }     from './renderModes.js';
import { GRASS_DEFAULT, PRESETS }         from './presets.js';
import { colorStackRGB }                  from './colorRamp.js';

// =============================================================================
// MODULE STATE
// =============================================================================
let seed   = 42;
let genome = null;   // current specimen's full gene vector (incl. structuralSeed)

// =============================================================================
// MORPHOLOGICAL SLIDER REGISTRY
// All continuous genes that have direct sliders in the UI.
// structuralSeed is kind:'seed' (uint32) — not a range slider; excluded here.
// =============================================================================
const MORPH_GENES = [
  // Form (Structural)
  'tillerCount', 'clumpSpread', 'bladeSegments', 'seedHead', 'fanSpread',
  'inflorescenceType', 'spikeletCount', 'grainsPerSpikelet', 'awnLength', 'midEarBulge',
  // Blade (Proportions) — bladeLength/bladeWidth/bladeTaper are two-point (see DUAL_GENES)
  'bladeShape', 'widestPos', 'crossSectionCurl', 'bladeTwist', 'stemRoundness',
  // Posture (Proportions) — arch/tipDroop are two-point (see DUAL_GENES)
  'curve', 'stiffness', 'verticality',
  // Look (Cosmetic)
  'pigment', 'chlorophyll', 'senescence', 'anthoPropensity', 'glaucousness',
  'bladeRaggedness', 'colorVariation', 'jitter', 'midribStrength', 'veining',
];

// Map gene name → slider element id
const GENE_SLIDER_ID = {
  tillerCount:     'tillerCountSlider',
  clumpSpread:     'clumpSpreadSlider',
  bladeSegments:   'bladeSegmentsSlider',
  seedHead:        'seedHeadSlider',
  fanSpread:       'fanSpreadSlider',
  inflorescenceType: 'inflorescenceTypeSlider',
  spikeletCount:     'spikeletCountSlider',
  grainsPerSpikelet: 'grainsPerSpikeletSlider',
  awnLength:         'awnLengthSlider',
  midEarBulge:       'midEarBulgeSlider',
  bladeLength:     'bladeLengthSlider',
  bladeWidth:      'bladeWidthSlider',
  bladeTaper:      'bladeTaperSlider',
  bladeShape:      'bladeShapeSlider',
  widestPos:       'widestPosSlider',
  crossSectionCurl: 'crossSectionCurlSlider',
  bladeTwist:      'bladeTwistSlider',
  stemRoundness:   'stemRoundnessSlider',
  arch:            'archSlider',
  curve:           'curveSlider',
  stiffness:       'stiffnessSlider',
  verticality:     'verticalitySlider',
  tipDroop:        'tipDroopSlider',
  pigment:         'pigmentSlider',
  bladeRaggedness: 'bladeRaggednessSlider',
  colorVariation:  'colorVariationSlider',
  jitter:          'jitterSlider',
  midribStrength:  'midribStrengthSlider',
  veining:         'veiningSlider',
  chlorophyll:     'chlorophyllSlider',
  senescence:      'senescenceSlider',
  anthoPropensity: 'anthoPropensitySlider',
  glaucousness:    'glaucousnessSlider',
};

// =============================================================================
// TWO-POINT (min–max) BLADE PARAMETERS
// Each is a pair of sliders: the base gene is the MIN, the …Max gene is the MAX.
// Every blade in a clump samples its own value in [min, max] (skeleton.js), so
// a clump has varied tillers. min ≤ max is enforced as you drag either thumb.
// =============================================================================
const DUAL_GENES = [
  { min: 'bladeLength', max: 'bladeLengthMax' },
  { min: 'bladeWidth',  max: 'bladeWidthMax' },
  { min: 'bladeTaper',  max: 'bladeTaperMax' },
  { min: 'arch',        max: 'archMax' },
  { min: 'tipDroop',    max: 'tipDroopMax' },
];

// =============================================================================
// ENV ENVELOPE — reads climate sliders; energy/biochem locked
// =============================================================================
function getEnvelope() {
  return {
    gravity:     parseFloat(document.getElementById('gravSlider').value),
    medium:      document.getElementById('mediumSel').value,
    energy:      'photo',
    biochem:     'carbon',
    temperature: parseFloat(document.getElementById('tempSlider').value    ?? '0.5'),
    light:       parseFloat(document.getElementById('lightSlider').value   ?? '0.6'),
    sunAngle:    parseFloat(document.getElementById('sunAngleSlider').value ?? '0.25'),
    wind:        parseFloat(document.getElementById('windSlider').value    ?? '0.2'),
    aridity:     parseFloat(document.getElementById('ariditySlider').value ?? '0.35'),
    fertility:   parseFloat(document.getElementById('fertilitySlider')?.value ?? '0.5'),
    starTemp:    parseFloat(document.getElementById('starTempSlider')?.value  ?? '0.55'),
  };
}

// =============================================================================
// ONE-TIME SETUP — fullscreen canvas + viewer
// =============================================================================
const canvas = document.getElementById('viewer-canvas');
const viewer = createViewer(canvas);
viewer.start();

// =============================================================================
// RENDER MODE CONTROLLER
// bladeMesh is a stable ref (created once in viewer, geometry swapped on
// setPlant — the mesh object itself never changes).
// We create the controller immediately and attach it; setMode calls before the
// first setPlant are no-ops (cacheRealMaterials caches on first non-lit call,
// after the first generate has set real materials).
// =============================================================================
const renderModeCtrl = createRenderModeController({
  bladeMesh: viewer.bladeMesh,
});
viewer.attachRenderModeController(renderModeCtrl);

// Wire render-mode panel buttons
(function wireRenderModePanel() {
  const panel = document.getElementById('rendermode-panel');
  if (!panel) return;

  const buttons = panel.querySelectorAll('[data-mode]');

  function activateMode(mode) {
    viewer.setRenderMode(mode);
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => activateMode(btn.dataset.mode));
  });

  // Start with 'lit' active
  activateMode('lit');
})();

// Wire wind toggle button + strength slider
(function wireWindControls() {
  const toggleBtn = document.getElementById('wind-toggle-btn');
  const strengthSlider = document.getElementById('wind-strength-slider');
  if (!toggleBtn || !strengthSlider) return;

  let windOn = false;

  toggleBtn.addEventListener('click', () => {
    windOn = !windOn;
    toggleBtn.classList.toggle('active', windOn);
    if (typeof viewer.setWindEnabled === 'function') {
      viewer.setWindEnabled(windOn);
    }
  });

  strengthSlider.addEventListener('input', () => {
    const val = parseFloat(strengthSlider.value);
    if (typeof viewer.setWindStrength === 'function') {
      viewer.setWindStrength(val);
    }
  });
})();

// Wire view-mode toggle (Specimen / Field)
(function wireViewToggle() {
  const specimenBtn = document.getElementById('view-specimen-btn');
  const fieldBtn    = document.getElementById('view-field-btn');
  if (!specimenBtn || !fieldBtn) return;

  function activateViewMode(mode) {
    specimenBtn.classList.toggle('active', mode === 'specimen');
    fieldBtn.classList.toggle('active',    mode === 'field');
    if (typeof viewer.setViewMode === 'function') {
      viewer.setViewMode(mode);
    }
  }

  specimenBtn.addEventListener('click', () => activateViewMode('specimen'));
  fieldBtn.addEventListener('click',    () => activateViewMode('field'));

  // Default: specimen
  activateViewMode('specimen');
})();

// Wire render-style toggle (Geometry / Billboard)
(function wireRenderStyleToggle() {
  const geometryBtn  = document.getElementById('rs-geometry-btn');
  const billboardBtn = document.getElementById('rs-billboard-btn');
  if (!geometryBtn || !billboardBtn) return;

  function activateRenderStyle(style) {
    geometryBtn.classList.toggle('active',  style === 'geometry');
    billboardBtn.classList.toggle('active', style === 'billboard');
    if (typeof viewer.setRenderStyle === 'function') {
      viewer.setRenderStyle(style);
    }
  }

  geometryBtn.addEventListener('click',  () => activateRenderStyle('geometry'));
  billboardBtn.addEventListener('click', () => activateRenderStyle('billboard'));

  // Default: geometry
  activateRenderStyle('geometry');
})();

// =============================================================================
// HELPERS
// =============================================================================

/** Push genome gene values back into all morphological sliders + their labels. */
function syncSlidersFromGenome(g) {
  for (const gene of MORPH_GENES) {
    const sliderId   = GENE_SLIDER_ID[gene];
    const slider     = document.getElementById(sliderId);
    if (!slider) continue;
    slider.value = g[gene];
    const displayId = slider.dataset.display;
    if (displayId) {
      const label = document.getElementById(displayId);
      if (label) label.textContent = parseFloat(g[gene]).toFixed(2);
    }
  }
  // Two-point (min–max) pairs: max defaults to min when the gene is absent.
  for (const { min, max } of DUAL_GENES) {
    const minS = document.getElementById(min + 'Slider');
    const maxS = document.getElementById(max + 'Slider');
    if (!minS || !maxS) continue;
    const mn = g[min];
    const mx = g[max] !== undefined ? g[max] : g[min];
    minS.value = mn;
    maxS.value = mx;
    const minL = document.getElementById(min + 'Val');
    const maxL = document.getElementById(max + 'Val');
    if (minL) minL.textContent = parseFloat(mn).toFixed(2);
    if (maxL) maxL.textContent = parseFloat(mx).toFixed(2);
  }
}

/** Re-resolve current genome against env and push to viewer. */
function renderCurrent() {
  if (!genome) return;
  const resolved = resolve(genome, getEnvelope());
  viewer.setPlant(resolved);
}

// =============================================================================
// GENERATE — randomGenome adapted to current climate, then sync sliders, render
// =============================================================================
function generate() {
  const env = getEnvelope();
  genome = randomGenome(env, seed);
  syncSlidersFromGenome(genome);
  const resolved = resolve(genome, env);
  viewer.setPlant(resolved);
}

// =============================================================================
// WINDOW RESIZE
// =============================================================================
window.addEventListener('resize', () => {
  viewer.resize();
});

// =============================================================================
// CLIMATE SLIDER WIRING
// Climate changes: update label, re-resolve current genome (no re-randomize).
// Adaptation (moving morph sliders) only happens on Generate.
// =============================================================================

function wireClimateSlider(sliderId, labelId) {
  const slider = document.getElementById(sliderId);
  const label  = labelId ? document.getElementById(labelId) : null;
  slider.addEventListener('input', () => {
    if (label) label.textContent = parseFloat(slider.value).toFixed(2);
    renderCurrent();
  });
}

wireClimateSlider('gravSlider',     'gravVal');
wireClimateSlider('tempSlider',     'tempVal');
wireClimateSlider('lightSlider',    'lightVal');
wireClimateSlider('sunAngleSlider', 'sunAngleVal');
wireClimateSlider('windSlider',     'windVal');
wireClimateSlider('ariditySlider',  'aridityVal');
wireClimateSlider('fertilitySlider', 'fertilityVal');
wireClimateSlider('starTempSlider',  'starTempVal');

document.getElementById('mediumSel').addEventListener('change', renderCurrent);

// =============================================================================
// MORPHOLOGICAL SLIDER WIRING
// Direct gene control: set genome[gene], keep structuralSeed, re-resolve.
// =============================================================================

for (const gene of MORPH_GENES) {
  const sliderId = GENE_SLIDER_ID[gene];
  const slider   = document.getElementById(sliderId);
  if (!slider) continue;

  const displayId = slider.dataset.display;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);

    // Update display label
    if (displayId) {
      const label = document.getElementById(displayId);
      if (label) label.textContent = val.toFixed(2);
    }

    // Direct genome edit: only this one gene changes, structuralSeed stays
    if (genome) {
      genome[gene] = val;
      renderCurrent();
    }
  });
}

// Two-point (min–max) blade parameter wiring: two sliders per parameter, with
// min ≤ max enforced (the thumb you drag pushes the other when they'd cross).
for (const { min, max } of DUAL_GENES) {
  const minS = document.getElementById(min + 'Slider');
  const maxS = document.getElementById(max + 'Slider');
  if (!minS || !maxS) continue;
  const minL = document.getElementById(min + 'Val');
  const maxL = document.getElementById(max + 'Val');

  function writeDual(mn, mx) {
    if (minL) minL.textContent = mn.toFixed(2);
    if (maxL) maxL.textContent = mx.toFixed(2);
    if (genome) { genome[min] = mn; genome[max] = mx; renderCurrent(); }
  }
  minS.addEventListener('input', () => {
    let mn = parseFloat(minS.value), mx = parseFloat(maxS.value);
    if (mn > mx) { mx = mn; maxS.value = String(mx); }   // push max up
    writeDual(mn, mx);
  });
  maxS.addEventListener('input', () => {
    let mn = parseFloat(minS.value), mx = parseFloat(maxS.value);
    if (mx < mn) { mn = mx; minS.value = String(mn); }   // push min down
    writeDual(mn, mx);
  });
}

// =============================================================================
// SEED FIELD + GENERATE BUTTON
// =============================================================================

document.getElementById('seedInput').addEventListener('input', () => {
  const raw = document.getElementById('seedInput').value.trim();
  const n   = parseInt(raw, 10);
  seed      = isNaN(n) ? 0 : (n >>> 0);
  // Seed change alone does NOT regenerate — user hits Generate to apply
});

document.getElementById('generateBtn').addEventListener('click', () => {
  // Reroll seed via crypto for a fresh specimen
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  seed = arr[0];
  document.getElementById('seedInput').value = seed.toString();
  generate();
});

document.getElementById('rerollSeedBtn').addEventListener('click', () => {
  // Reroll ONLY the structural seed → a new INDIVIDUAL of the same specimen:
  // the skeleton + clump topology change, but every gene (and the climate) stays
  // exactly as-is. (Generate, by contrast, rolls a whole new climate-adapted
  // genome.) Re-resolve the current genome with its new structuralSeed.
  if (!genome) return;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  genome.structuralSeed = arr[0] >>> 0;
  renderCurrent();
});

// =============================================================================
// PRESET MODAL WIRING
// =============================================================================

(function wirePresetModal() {
  const modal     = document.getElementById('presets-modal');
  const openBtn   = document.getElementById('presetsBtn');
  const closeBtn  = document.getElementById('presets-close-btn');
  const body      = document.getElementById('presets-body');
  if (!modal || !openBtn || !closeBtn || !body) return;

  // ── Category order ──────────────────────────────────────────────────────────
  const CATEGORY_ORDER = [
    'Lawn', 'Meadow', 'Ornamental', 'Cereal', 'Wetland',
  ];

  // ── Build card DOM ──────────────────────────────────────────────────────────
  function buildCards() {
    // Group presets by category; fall back to 'Other' for missing category.
    const groups = new Map();
    for (const preset of PRESETS) {
      const cat = preset.category ?? 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(preset);
    }

    // Render groups in the defined order, skipping empty ones.
    for (const cat of CATEGORY_ORDER) {
      const presets = groups.get(cat);
      if (!presets || presets.length === 0) continue;

      const heading = document.createElement('div');
      heading.className = 'preset-category-heading';
      heading.textContent = cat;
      body.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'preset-card-grid';

      for (const preset of presets) {
        const card = document.createElement('button');
        card.className = 'preset-card';
        card.type = 'button';
        card.dataset.presetId = preset.id;

        // Color swatch from the condition-driven pigment stack (neutral env).
        const [r, g, b] = colorStackRGB(computeColorAxes(preset.genome, {}));
        const swatch = document.createElement('span');
        swatch.className = 'preset-swatch';
        swatch.style.background =
          `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        card.appendChild(swatch);

        // Label.
        const label = document.createElement('span');
        label.className = 'preset-card-label';
        label.textContent = preset.label ?? preset.id;
        card.appendChild(label);

        // Experimental badge.
        if (preset.experimental === true) {
          const badge = document.createElement('span');
          badge.className = 'preset-badge-experimental';
          badge.textContent = 'exp';
          card.appendChild(badge);
        }

        card.addEventListener('click', () => {
          genome = { ...preset.genome };
          syncSlidersFromGenome(genome);
          renderCurrent();
          closeModal();
        });

        grid.appendChild(card);
      }

      body.appendChild(grid);
    }
  }

  // ── Open / close ────────────────────────────────────────────────────────────
  function openModal() {
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  // Open button.
  openBtn.addEventListener('click', openModal);

  // X button.
  closeBtn.addEventListener('click', closeModal);

  // Click on backdrop (outside the panel) closes the modal.
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape key closes the modal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // Build cards once on startup.
  buildCards();
})();

// =============================================================================
// INITIAL LOAD — boot to GRASS_DEFAULT so the page always opens on a believable
// mid lawn blade clump. The "Generate" button rolls a climate-adapted random genome.
// =============================================================================

// Boot with a "live" specimen: GRASS_DEFAULT plus a small awned flower head so
// the inflorescence sliders (seed head / spikelet / grains / awn / bulge) visibly
// respond on first load. Picking the Lawn preset reverts to the clean turf vector.
genome = { ...GRASS_DEFAULT, seedHead: 0.25, inflorescenceType: 0.45, awnLength: 0.2 };
syncSlidersFromGenome(genome);
const resolved = resolve(genome, getEnvelope());
viewer.setPlant(resolved);

// =============================================================================
// STATS PANEL — polls viewer.getStats() ~4×/sec and updates DOM
// =============================================================================

const statFps         = document.getElementById('stat-fps');
const statTriangles   = document.getElementById('stat-triangles');
const statDrawCalls   = document.getElementById('stat-drawcalls');
const statBlades      = document.getElementById('stat-blades');
const statBones       = document.getElementById('stat-bones');
const statResolution  = document.getElementById('stat-resolution');

function fpsColorClass(fps) {
  if (fps >= 50) return 'fps-good';
  if (fps >= 30) return 'fps-ok';
  return 'fps-bad';
}

function formatNumber(n) {
  if (n == null) return '--';
  return Number(n).toLocaleString('en-US');
}

function updateStats() {
  if (typeof viewer.getStats !== 'function') return;

  let stats;
  try { stats = viewer.getStats(); } catch (_) { return; }
  if (!stats) return;

  // FPS — color-coded
  const fps = stats.fps != null ? Math.round(stats.fps) : null;
  statFps.textContent = fps != null ? fps : '--';
  statFps.className = fps != null ? fpsColorClass(fps) : '';

  statTriangles.textContent   = formatNumber(stats.triangles);
  statDrawCalls.textContent   = formatNumber(stats.drawCalls);
  statBlades.textContent      = formatNumber(stats.blades);
  statBones.textContent       = formatNumber(stats.bones);

  if (stats.resolution != null) {
    const r = stats.resolution;
    statResolution.textContent = typeof r === 'string' ? r : `${r.width ?? r.x ?? '--'}×${r.height ?? r.y ?? '--'}`;
  } else {
    statResolution.textContent = '--';
  }
}

setInterval(updateStats, 250);
