// =============================================================================
// viewer.js — grass specimen and field viewer
//
// Renders a resolved grass genome via a standard THREE.js mesh scene.
//
// Two view modes (toggle via setViewMode):
//   'specimen' — single clump: one THREE.Mesh built from buildBladeGeometry()
//                shaded by createBladeMaterial().  Design/authoring view.
//   'field'    — scatter view: one THREE.InstancedMesh of the same clump
//                geometry, with per-instance transforms from computeFieldScatter().
//                One geometry, one draw call.  Camera auto-fits the field bounds.
//
// Wind:
//   Per-frame uTime/uWindStrength/uWindDir uniforms pushed to the blade material
//   (and its depth material).  The GLSL windOffset() function drives per-vertex
//   displacement via the aSwayFactor attribute emitted by buildBladeGeometry().
//   uWindStrength=0 → exact rest pose (calm guarantee from windGlsl.js).
//
// Camera: PerspectiveCamera, fov = 50°.  Auto-frames on first setPlant(); orbit
// state persists on subsequent calls.  Auto-spin until first user interaction.
//
// Navigation:
//   Left-drag   → orbit (azimuth / elevation)
//   Wheel       → dolly (orbit radius)
//   Shift-drag or right-drag → pan (translate target in camera right/up plane)
//
// Usage:
//   import { createViewer } from './viewer.js';
//   const viewer = createViewer(canvas);
//   viewer.setPlant(resolved);           // call after resolve()
//   viewer.setViewMode('specimen');      // or 'field'
//   viewer.start();
//   viewer.resize();
//   viewer.dispose();
//   viewer.bladeMesh                     // the current blade Mesh (specimen) or null in field
// =============================================================================

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass }        from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildBladeGeometry, createBladeMaterial, createBladeDepthMaterial, bladeWidthGeneToWorld } from './bladeMesh.js';
import * as windGlsl from './windGlsl.js';
import { computeFieldScatter } from './fieldScatter.js';
import { makeGrassBillboardTexture, buildBillboardField } from './billboardField.js';
import { loadEnvironment } from './environment.js';
import { createGround }    from './ground.js';

// =============================================================================
// CONSTANTS
// =============================================================================

// FOV: 50° full vertical angle for a calm, natural framing.
// HALF_ANGLE = tan(25°) ≈ 0.4663 (used in fit math: dist = radius / HALF_ANGLE).
const PERSP_FOV   = 50;
const HALF_ANGLE  = Math.tan((PERSP_FOV / 2) * (Math.PI / 180)); // ≈ 0.4663
const PERSP_NEAR  = 0.05;
const PERSP_FAR   = 100000.0; // large enough to encompass the sky sphere (scaled to 45000)

// Sky Preetham parameters — tuned for a pleasant mid-day sky.
const SKY_TURBIDITY         = 6.0;
const SKY_RAYLEIGH          = 2.0;
const SKY_MIE_COEFFICIENT   = 0.005;
const SKY_MIE_DIRECTIONAL_G = 0.8;
const SKY_SCALE             = 45000;

const FIT_MARGIN = 1.25;
const FIT_MIN    = 1.0;
const FIT_MAX    = 80.0;

const MIN_RADIUS    = 0.5;
const MAX_RADIUS    = 80.0;
const MAX_ELEVATION = (85 * Math.PI) / 180;

const AUTO_SPIN_SPEED = 0.15; // radians per second

// Wind defaults — direction normalize(1, 0.2), clamped strength range.
const WIND_DIR_DEFAULT  = new THREE.Vector2(1, 0.2).normalize();
const WIND_STRENGTH_MIN = 0.0;
const WIND_STRENGTH_MAX = 1.5;
const WIND_STRENGTH_FALLBACK = 0.6;

// Field view scatter defaults (Poisson-disk).
// FIELD_RADIUS matches the ground plane half-size (20/2 = 10) so the disc
// reaches the mid-point of every edge; the four small corner triangles beyond
// the disc are negligible and look natural.  This gives ~2,500–3,000 clumps.
const FIELD_RADIUS    = 10;   // disc radius in world units — fills the 20×20 ground plane
const FIELD_MIN_DIST  = 0.35; // well under clump footprint (2×r≈0.55) → clumps interlock
const FIELD_SCALE_VAR = 0.15;

// =============================================================================
// INTERNAL — AABB fit from bounds
// =============================================================================

function computeFitFromBounds(bounds) {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const hw = (maxX - minX) * 0.5;
  const hh = (maxY - minY) * 0.5;
  const hd = (maxZ - minZ) * 0.5;
  const boundRadius = Math.sqrt(hw * hw + hh * hh + hd * hd) * 1.1;

  const raw = (boundRadius / HALF_ANGLE) * FIT_MARGIN;
  const fitRadius = Math.max(FIT_MIN, Math.min(raw, FIT_MAX));

  return { center: new THREE.Vector3(cx, cy, cz), fitRadius };
}

function defaultFit() {
  return { center: new THREE.Vector3(0, 1, 0), fitRadius: 4.5 };
}

// =============================================================================
// INTERNAL — camera orbit position
// =============================================================================

function orbitCamPos(azimuth, elevation, radius, target) {
  const cosEl = Math.cos(elevation);
  return new THREE.Vector3(
    target.x + radius * cosEl * Math.sin(azimuth),
    target.y + radius * Math.sin(elevation),
    target.z + radius * cosEl * Math.cos(azimuth)
  );
}

// =============================================================================
// PUBLIC FACTORY
// =============================================================================

/**
 * createViewer(canvas)
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{
 *   setPlant(resolved: object): void,
 *   setViewMode(mode: 'specimen'|'field'): void,
 *   start(): void,
 *   resize(): void,
 *   dispose(): void,
 *   getStats(): object,
 *   bladeMesh: THREE.Mesh | null,
 *   setRenderMode(mode: string): void,
 *   setRenderStyle(style: 'geometry'|'billboard'): void,
 *   attachRenderModeController(ctrl: object): void,
 *   setWindEnabled(enabled: boolean): void,
 *   setWindStrength(strength: number): void,
 * }}
 */
export function createViewer(canvas) {
  // ---------------------------------------------------------------------------
  // Render-mode controller slot
  // ---------------------------------------------------------------------------
  let _renderModeController = null;

  // ---------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // OutputPass applies AgX tonemapping + sRGB once; keep intermediate targets linear.
  // SRGBColorSpace: OutputPass writes the final sRGB-encoded frame — the renderer
  // must match so the GPU hardware sRGB conversion is applied exactly once.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Disable autoReset so info.render accumulates across all of composer's passes.
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

  // ---------------------------------------------------------------------------
  // Scene + camera
  // ---------------------------------------------------------------------------
  const scene = new THREE.Scene();

  const perspCam = new THREE.PerspectiveCamera(
    PERSP_FOV,
    (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight),
    PERSP_NEAR,
    PERSP_FAR
  );

  // ---------------------------------------------------------------------------
  // Procedural sky (Preetham model via Sky addon)
  // ---------------------------------------------------------------------------
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value        = SKY_TURBIDITY;
  skyUniforms['rayleigh'].value         = SKY_RAYLEIGH;
  skyUniforms['mieCoefficient'].value   = SKY_MIE_COEFFICIENT;
  skyUniforms['mieDirectionalG'].value  = SKY_MIE_DIRECTIONAL_G;

  const _sunPos = new THREE.Vector3();

  function setSkyFromLightDir(lightDir) {
    _sunPos.copy(lightDir).normalize();
    skyUniforms['sunPosition'].value.copy(_sunPos);
  }

  setSkyFromLightDir(new THREE.Vector3(0.5, 1.0, 0.5).normalize());

  // ---------------------------------------------------------------------------
  // Lights
  // ---------------------------------------------------------------------------
  // Sun: warm white 0xfff4e0, intensity 1.1 for a touch more directional definition.
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  sunLight.position.set(25, 50, 25);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Sky-dominant balance: hemisphere provides the ambient fill so blades in
  // shadow or facing away from the sun still read green rather than black.
  // Sky tint: 0xc8ddb0 — warm greenish-white (less blue than prior 0xb0d0f0)
  // so the ambient fill doesn't cast a cool blue cast over the grass.
  // Ground bounce: 0x5a3d1a — warm brown earth.
  // Intensity 0.8 (scaled back to 0.6 after IBL loads, matching prior behaviour).
  const hemiLight = new THREE.HemisphereLight(0xc8ddb0, 0x5a3d1a, 0.55);
  scene.add(hemiLight);

  function updateShadowCamera(bounds) {
    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    const halfW = (maxX - minX) / 2;
    const halfD = (maxZ - minZ) / 2;
    const halfExtent = Math.max(halfW, halfD) + 5;
    const cam = sunLight.shadow.camera;
    cam.left   = -halfExtent;
    cam.right  =  halfExtent;
    cam.top    =  halfExtent;
    cam.bottom = -halfExtent;
    cam.near   = -50;
    cam.far    = maxY + 50;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------
  // Ground plane
  // ---------------------------------------------------------------------------
  const ground = createGround();
  scene.add(ground.mesh);

  // ---------------------------------------------------------------------------
  // IBL — guaranteed deterministic: on failure, hemisphere light provides the
  // fallback fill so shading is reproducible regardless of env-load outcome.
  // ---------------------------------------------------------------------------
  let envMapResult = null;
  loadEnvironment(renderer).then((result) => {
    envMapResult = result;
    scene.environment = result.envMap;
    scene.environmentIntensity = 0.6;
    // Env loaded — scale back hemisphere slightly to avoid double-counting sky fill.
    hemiLight.intensity = 0.6;
  }).catch((err) => {
    console.warn('IBL load failed, using hemisphere-only fill:', err);
    // Hemisphere (already at 0.8) provides the ambient fill — no further action.
  });

  // ---------------------------------------------------------------------------
  // Blade material — created ONCE, reused across setPlant and view modes.
  // Wind uniforms live in mat.userData.windUniforms and are pushed per-frame.
  // Color uniforms live in mat.userData.colorUniforms and are pushed per setPlant.
  // ---------------------------------------------------------------------------
  const bladeMaterial = createBladeMaterial(THREE, {
    windGlsl,
    color: {},            // identity green; pigment-stack axes updated live in setPlant
    colorVariation: 0.0,  // updated live in setPlant from resolved genome
    veining: 0.5,         // procedural blade texture; updated live in setPlant
  });
  const bladeDepthMaterial = createBladeDepthMaterial(THREE, { windGlsl });

  // ---------------------------------------------------------------------------
  // Specimen mesh — stable object; geometry replaced on each setPlant.
  // ---------------------------------------------------------------------------
  let bladeGeometry = new THREE.BufferGeometry();
  const specimenMesh = new THREE.Mesh(bladeGeometry, bladeMaterial);
  specimenMesh.castShadow = true;
  specimenMesh.receiveShadow = true;
  specimenMesh.customDepthMaterial = bladeDepthMaterial;
  scene.add(specimenMesh);

  // ---------------------------------------------------------------------------
  // Grain / inflorescence InstancedMesh — renders resolved.foliage (the seed-head
  // SoA: grain ovoids + thin awn bristles). One shared low-poly ovoid geometry,
  // instanced; per-instance matrix from position/tangent/scale·aspect and a
  // per-instance ripeness colour from ageColor (green→straw). Specimen view only.
  // ---------------------------------------------------------------------------
  const grainGeo = new THREE.IcosahedronGeometry(1, 1);

  // Inject the SAME wind displacement the blades use, so grain ears track the
  // swaying blade tips (and sway with them) instead of floating, detached and
  // motionless, at the rest tip. swayFactor = 1.0 (ears sit at/above the blade
  // tip, which uses aSwayFactor=1) → the ear translates with the tip. Applied
  // post-instanceMatrix and counter-rotated, exactly like createBladeMaterial.
  function injectGrainWind(mat) {
    const { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS } = windGlsl;
    mat.userData.windUniforms = {
      uTime:         { value: WIND_UNIFORM_DEFAULTS.uTime },
      uWindStrength: { value: WIND_UNIFORM_DEFAULTS.uWindStrength },
      uWindDir:      { value: new THREE.Vector2(...WIND_UNIFORM_DEFAULTS.uWindDir) },
    };
    mat.onBeforeCompile = function (shader) {
      Object.assign(shader.uniforms, mat.userData.windUniforms);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        ['#include <common>', WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL].join('\n')
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        [
          '// --- grain/ear wind: track + sway with the blade tips ---',
          'vec4 _gwp = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          '  _gwp = instanceMatrix * _gwp;',
          '#endif',
          '_gwp = modelMatrix * _gwp;',
          'vec3 _gwind = windOffset(_gwp.xyz, 1.0);',
          '#ifdef USE_INSTANCING',
          '  _gwind = inverse(mat3(instanceMatrix)) * _gwind;',
          '#endif',
          'transformed += _gwind;',
          '#include <project_vertex>',
        ].join('\n')
      );
      mat.userData.compiledShader = shader;
    };
    mat.needsUpdate = true;
  }

  const grainMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.0 });
  injectGrainWind(grainMat);
  // Depth material so the ear's shadow follows the wind sway too.
  const grainDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  injectGrainWind(grainDepthMat);
  let grainMesh = null;

  function updateGrainMesh(foliage) {
    if (!foliage || !foliage.scale) {
      if (grainMesh) grainMesh.visible = false;
      return;
    }
    const cap = foliage.scale.length;
    if (!grainMesh) {
      grainMesh = new THREE.InstancedMesh(grainGeo, grainMat, cap);
      grainMesh.castShadow = true;
      grainMesh.receiveShadow = true;
      grainMesh.frustumCulled = false;
      grainMesh.customDepthMaterial = grainDepthMat;  // wind-aware shadow
      scene.add(grainMesh);
    }
    const cnt = Math.min(foliage.count, cap);
    const m  = new THREE.Matrix4();
    const q  = new THREE.Quaternion();
    const p  = new THREE.Vector3();
    const s  = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < cnt; i++) {
      p.set(foliage.position[i * 3], foliage.position[i * 3 + 1], foliage.position[i * 3 + 2]);
      tan.set(foliage.tangent[i * 3], foliage.tangent[i * 3 + 1], foliage.tangent[i * 3 + 2]);
      if (tan.lengthSq() < 1e-8) tan.set(0, 1, 0); else tan.normalize();
      q.setFromUnitVectors(up, tan);
      const sc  = foliage.scale[i];
      const asp = foliage.aspect ? foliage.aspect[i] : 1;
      s.set(sc, sc * asp, sc);          // stretch the long axis (awns → thin bristles)
      m.compose(p, q, s);
      grainMesh.setMatrixAt(i, m);
      // ageColor 0 (green/unripe) → 1 (amber/straw): linear RGB, matches blade path.
      const a = foliage.ageColor[i];
      col.setRGB(0.20 + 0.55 * a, 0.34 + 0.30 * a, 0.10 + 0.16 * a);
      grainMesh.setColorAt(i, col);
    }
    grainMesh.count = cnt;
    grainMesh.instanceMatrix.needsUpdate = true;
    if (grainMesh.instanceColor) grainMesh.instanceColor.needsUpdate = true;
    // Grains are authored in specimen view; the field view is the lawn carpet.
    grainMesh.visible = (currentViewMode === 'specimen') && cnt > 0;
  }

  // ---------------------------------------------------------------------------
  // Field mesh — InstancedMesh; rebuilt on demand, null when in specimen mode.
  // Kept null until first switch to field mode.
  // ---------------------------------------------------------------------------
  let fieldMesh = null;

  // ---------------------------------------------------------------------------
  // Post-processing composer
  // RenderPass → UnrealBloomPass → SMAAPass → OutputPass
  // ---------------------------------------------------------------------------
  const w0 = canvas.clientWidth  || window.innerWidth;
  const h0 = canvas.clientHeight || window.innerHeight;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, perspCam));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(w0, h0),
    0.10,  // strength — very subtle, only genuine specular highlights
    0.4,   // radius
    2.0    // threshold — raised further so well-lit grass doesn't bloom
  ));
  composer.addPass(new SMAAPass(w0, h0));
  composer.addPass(new OutputPass());

  // ---------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------
  const clock = new THREE.Clock();

  // ---------------------------------------------------------------------------
  // Orbit state — persists across setPlant() calls
  // ---------------------------------------------------------------------------
  let azimuth   = 0.3;
  let elevation = 0.25;
  let radius    = 5.0;
  let target    = new THREE.Vector3(0, 0, 0);

  // Only auto-frame on the very first setPlant call.
  let firstPlant = true;

  // Last blade geometry bounds (for shadow camera).
  let lastBounds = null;

  // ---------------------------------------------------------------------------
  // View mode — 'specimen' | 'field'
  // ---------------------------------------------------------------------------
  let currentViewMode = 'specimen';

  // Cached resolved plant for rebuilding field view on mode switch.
  let lastResolved = null;

  // ---------------------------------------------------------------------------
  // Render style — 'geometry' | 'billboard'
  // Controls which mesh type is shown in field mode.
  // 'geometry' = blade InstancedMesh (default).
  // 'billboard' = cross-quad billboard InstancedMesh from billboardField.js.
  // ---------------------------------------------------------------------------
  let currentRenderStyle = 'geometry';

  // ---------------------------------------------------------------------------
  // Wind state
  // ---------------------------------------------------------------------------
  let windEnabled  = false;
  let windStrength = WIND_STRENGTH_FALLBACK;
  let windTime     = windGlsl.WIND_UNIFORM_DEFAULTS.uTime;

  /**
   * Push per-frame wind uniforms to a material's userData.windUniforms block.
   * Guards against missing windUniforms (materials without wind injection).
   */
  function applyWindToMaterial(material, strength) {
    const wu = material && material.userData && material.userData.windUniforms;
    if (!wu) return;
    if (wu.uTime)         wu.uTime.value         = windTime;
    if (wu.uWindStrength) wu.uWindStrength.value  = strength;
    if (wu.uWindDir)      wu.uWindDir.value.set(WIND_DIR_DEFAULT.x, WIND_DIR_DEFAULT.y);
  }

  function applyWindUniforms(strength) {
    applyWindToMaterial(bladeMaterial, strength);
    applyWindToMaterial(bladeDepthMaterial, strength);
    applyWindToMaterial(grainMat, strength);
    applyWindToMaterial(grainDepthMat, strength);
  }

  // ---------------------------------------------------------------------------
  // Auto-spin — plays until first pointer/wheel interaction
  // ---------------------------------------------------------------------------
  let autoSpin = true;

  function stopAutoSpin() {
    autoSpin = false;
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  let currentBoneCount = 0;
  let currentBladeCount = 0;  // real blade count in specimen mode
  let fpsSmoothEma  = 0;
  let lastFrameTime = 0;
  const FPS_EMA_ALPHA = 0.1;

  // ---------------------------------------------------------------------------
  // Pointer / wheel event handling
  // ---------------------------------------------------------------------------
  let pointerDown = false;
  let lastX       = 0;
  let lastY       = 0;
  let isPan       = false;
  let pointerId   = null;

  function onPointerDown(e) {
    isPan = e.shiftKey || e.button === 2;
    pointerDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    stopAutoSpin();
  }

  function onPointerMove(e) {
    if (!pointerDown || e.pointerId !== pointerId) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (isPan) {
      const camPos  = orbitCamPos(azimuth, elevation, radius, target);
      const forward = new THREE.Vector3().subVectors(target, camPos).normalize();
      const right   = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const up      = new THREE.Vector3().crossVectors(right, forward);
      const panScale = radius * 0.0015;
      target.addScaledVector(right, -dx * panScale);
      target.addScaledVector(up,    -dy * panScale);
    } else {
      const w = canvas.clientWidth  || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      azimuth   -= dx / w * Math.PI * 1.5;
      elevation += dy / h * Math.PI;
      elevation  = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, elevation));
    }
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerDown = false;
    pointerId   = null;
  }

  function onWheel(e) {
    e.preventDefault();
    stopAutoSpin();
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius * factor));
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown',   onPointerDown);
  canvas.addEventListener('pointermove',   onPointerMove);
  canvas.addEventListener('pointerup',     onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel',         onWheel, { passive: false });
  canvas.addEventListener('contextmenu',   onContextMenu);

  // ---------------------------------------------------------------------------
  // Render resolution
  // ---------------------------------------------------------------------------
  const resolution = new THREE.Vector2();

  function updateResolution() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w   = (canvas.clientWidth  || window.innerWidth)  * dpr;
    const h   = (canvas.clientHeight || window.innerHeight) * dpr;
    resolution.set(w, h);
  }
  updateResolution();

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------
  let loopRunning = false;
  let rafId       = null;

  function frame() {
    rafId = requestAnimationFrame(frame);

    // FPS measurement via EMA.
    const now = performance.now();
    if (lastFrameTime > 0) {
      const dtMs = now - lastFrameTime;
      if (dtMs > 0) {
        const instantFps = 1000 / dtMs;
        fpsSmoothEma = fpsSmoothEma === 0
          ? instantFps
          : fpsSmoothEma + FPS_EMA_ALPHA * (instantFps - fpsSmoothEma);
      }
    }
    lastFrameTime = now;

    const dt = clock.getDelta();

    // Advance wind time always (continuous phase even when toggled off).
    windTime += dt;
    const activeStrength = windEnabled ? windStrength : 0;
    applyWindUniforms(activeStrength);

    if (autoSpin) {
      azimuth += AUTO_SPIN_SPEED * dt;
    }

    const camPos = orbitCamPos(azimuth, elevation, radius, target);
    perspCam.position.copy(camPos);
    perspCam.up.set(0, 1, 0);
    perspCam.lookAt(target);
    perspCam.updateMatrixWorld();

    renderer.info.reset();
    composer.render();
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — build THREE.BufferGeometry from a buildBladeGeometry() result
  // ---------------------------------------------------------------------------
  function buildThreeGeometry(g) {
    const geo = new THREE.BufferGeometry();

    if (g.vertexCount > 0) {
      geo.setAttribute('position',   new THREE.BufferAttribute(g.positions,  3));
      geo.setAttribute('normal',     new THREE.BufferAttribute(g.normals,    3));
      geo.setAttribute('uv',         new THREE.BufferAttribute(g.uvs,        2));
      geo.setAttribute('ao',         new THREE.BufferAttribute(g.ao,         1));
      geo.setAttribute('aSwayFactor', new THREE.BufferAttribute(g.swayFactor, 1));
      geo.setAttribute('colorSeed',  new THREE.BufferAttribute(g.colorSeed,  1));
      // aBladeU: per-vertex across-width coordinate (u channel of the UVs) for the
      // procedural blade-texture fragment shader. three.js does not expose vUv
      // without a map, so the blade material reads this custom attribute instead.
      const bladeU = new Float32Array(g.vertexCount);
      for (let i = 0; i < g.vertexCount; i++) bladeU[i] = g.uvs[i * 2];
      geo.setAttribute('aBladeU', new THREE.BufferAttribute(bladeU, 1));
      geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    }

    return geo;
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — dispose and remove the current field mesh (if any)
  //
  // fieldMeshOwnsGeometry tracks whether the field mesh owns its geometry.
  // In 'geometry' mode the InstancedMesh shares bladeGeometry with the specimen
  // and must NOT dispose it (specimen still needs it).
  // In 'billboard' mode buildBillboardField allocates a private geometry that
  // must be disposed here to avoid a GPU resource leak on style switches.
  // ---------------------------------------------------------------------------
  let fieldMeshOwnsGeometry = false;

  function disposeFieldMesh() {
    if (fieldMesh !== null) {
      scene.remove(fieldMesh);
      if (fieldMeshOwnsGeometry && fieldMesh.geometry) {
        fieldMesh.geometry.dispose();
      }
      if (fieldMeshOwnsGeometry && fieldMesh.material) {
        // Billboard material is private — dispose it too.
        fieldMesh.material.dispose();
      }
      // Dispose the InstancedMesh's own GPU resources (instanceMatrix buffer etc.).
      fieldMesh.dispose();
      fieldMesh = null;
      fieldMeshOwnsGeometry = false;
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — build field InstancedMesh from current blade geometry
  // ---------------------------------------------------------------------------
  function buildFieldMesh(geo, scatterSeed) {
    const scatter = computeFieldScatter(scatterSeed, {
      radius:   FIELD_RADIUS,
      minDist:  FIELD_MIN_DIST,
    });

    // Use specimenMesh.material (the LIVE reference) so that any render-mode
    // override already applied to the specimen mesh propagates to the field view.
    const instMesh = new THREE.InstancedMesh(geo, specimenMesh.material, scatter.count);
    instMesh.castShadow    = true;
    instMesh.receiveShadow = true;
    instMesh.frustumCulled = false; // field spans the frustum
    // Assign the wind-aware depth material so field shadows follow the wind sway,
    // mirroring the specimen mesh's customDepthMaterial assignment.
    instMesh.customDepthMaterial = bladeDepthMaterial;

    // Write per-instance transforms.
    // Non-uniform scale: scalesXZ (footprint/width) is independent from scalesY (height).
    // Compose as (scalesXZ[i], scalesY[i], scalesXZ[i]) so instances vary in both
    // dimensions naturally. The wind inverse(mat3(instanceMatrix)) handles the
    // non-uniform scale adequately since XZ is uniform — only Y differs.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const axisY = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < scatter.count; i++) {
      p.set(
        scatter.positions[i * 3],
        scatter.positions[i * 3 + 1],
        scatter.positions[i * 3 + 2]
      );
      // Independent non-uniform scale: width (XZ) and height (Y) vary separately.
      s.set(scatter.scalesXZ[i], scatter.scalesY[i], scatter.scalesXZ[i]);
      q.setFromAxisAngle(axisY, scatter.rotationsY[i]);
      m.compose(p, q, s);
      instMesh.setMatrixAt(i, m);
    }
    instMesh.instanceMatrix.needsUpdate = true;

    // Bind per-instance aColorJitter as an InstancedBufferAttribute so the blade
    // material's per-clump tint (mapped from [-1,1] to a small hue+value delta)
    // is driven by the scatter's colorJitter array. Defaults to 0 when absent.
    const jitterData = new Float32Array(scatter.count);
    for (let i = 0; i < scatter.count; i++) {
      jitterData[i] = scatter.colorJitter ? scatter.colorJitter[i] : 0.0;
    }
    geo.setAttribute(
      'aColorJitter',
      new THREE.InstancedBufferAttribute(jitterData, 1)
    );

    return { instMesh, scatter };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — build billboard field InstancedMesh from scatter + clump height
  // ---------------------------------------------------------------------------
  function buildBillboardMesh(scatter, clumpHeight) {
    const texture  = makeGrassBillboardTexture(THREE);
    const bbMesh   = buildBillboardField(THREE, {
      texture,
      scatter,
      height: clumpHeight,
    });
    bbMesh.frustumCulled = false; // field spans the frustum
    return bbMesh;
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — compute field AABB (from scatter + clump bounds)
  // ---------------------------------------------------------------------------
  function computeFieldBounds(scatter, clumpBounds) {
    // Field XZ extent: max |X| and |Z| position + clump half-size.
    let maxAbsX = 0, maxAbsZ = 0;
    for (let i = 0; i < scatter.count; i++) {
      const ax = Math.abs(scatter.positions[i * 3]);
      const az = Math.abs(scatter.positions[i * 3 + 2]);
      if (ax > maxAbsX) maxAbsX = ax;
      if (az > maxAbsZ) maxAbsZ = az;
    }

    // Clump height (Y extent from blade geometry bounds).
    const clumpHalfX  = (clumpBounds.max[0] - clumpBounds.min[0]) * 0.5;
    const clumpHalfZ  = (clumpBounds.max[2] - clumpBounds.min[2]) * 0.5;
    const clumpHeight = clumpBounds.max[1] - Math.min(0, clumpBounds.min[1]);

    const fieldHalfX = maxAbsX + clumpHalfX + 1;
    const fieldHalfZ = maxAbsZ + clumpHalfZ + 1;
    const fieldY     = clumpHeight > 0 ? clumpHeight : 2.0;

    return {
      min: [-fieldHalfX, 0,       -fieldHalfZ],
      max: [ fieldHalfX, fieldY,   fieldHalfZ],
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — activate specimen view
  // ---------------------------------------------------------------------------
  function activateSpecimen() {
    // Remove field mesh from scene.
    disposeFieldMesh();
    // Ensure specimen mesh is in scene.
    if (!scene.getObjectById(specimenMesh.id)) {
      scene.add(specimenMesh);
    }
    specimenMesh.visible = true;
    if (grainMesh) grainMesh.visible = grainMesh.count > 0;
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — activate field view (requires lastResolved to be set)
  // ---------------------------------------------------------------------------
  function activateField() {
    if (!lastResolved) return;

    // Remove any stale field mesh first.
    disposeFieldMesh();

    // Hide the specimen (and its grains — field view is the lawn carpet).
    specimenMesh.visible = false;
    if (grainMesh) grainMesh.visible = false;

    // Build the field InstancedMesh on the current blade geometry.
    const scatterSeed = lastResolved.genome
      ? (lastResolved.genome.structuralSeed >>> 0)
      : 0xF1E1D5CA;

    // Use lastBounds when available; fall back to a sentinel that gives a
    // sensible field framing even when the first plant had zero vertices.
    // The fallback represents a ~1m tall grass clump — better than mis-framing
    // to a degenerate bounds.
    const clumpBounds = lastBounds || { min: [-0.1, 0, -0.1], max: [0.1, 1.0, 0.1] };
    const clumpHeight = clumpBounds.max[1] - Math.min(0, clumpBounds.min[1]);

    let scatter;
    if (currentRenderStyle === 'billboard') {
      // Compute scatter independently for billboard (no geometry needed).
      scatter = computeFieldScatter(scatterSeed, {
        radius:   FIELD_RADIUS,
        minDist:  FIELD_MIN_DIST,
      });
      fieldMesh = buildBillboardMesh(scatter, clumpHeight > 0 ? clumpHeight : 1.0);
      // Billboard owns its private geometry + material — must dispose on teardown.
      fieldMeshOwnsGeometry = true;
    } else {
      // 'geometry' (default) — blade InstancedMesh shares bladeGeometry with specimen.
      const result = buildFieldMesh(bladeGeometry, scatterSeed);
      scatter  = result.scatter;
      fieldMesh = result.instMesh;
      // Geometry is shared with specimen — do NOT dispose it in disposeFieldMesh.
      fieldMeshOwnsGeometry = false;
    }

    scene.add(fieldMesh);

    // Auto-fit to field bounds.
    const fieldBounds = computeFieldBounds(scatter, clumpBounds);
    updateShadowCamera(fieldBounds);
    const fit = computeFitFromBounds(fieldBounds);
    target = fit.center.clone();
    radius = fit.fitRadius;
  }

  // ---------------------------------------------------------------------------
  // Controller — public API
  // ---------------------------------------------------------------------------

  return {
    /**
     * setPlant(resolved)
     *
     * Rebuilds blade geometry from a resolved genome.  Orbit state persists;
     * only the first call auto-frames.
     *
     * resolved must include: graph, foliage, lightDir, boneCount, and the
     * blade mesh opts (bladeWidth, bladeTaper, midribStrength, bladeRaggedness).
     *
     * @param {object} resolved  Output of resolve().
     */
    setPlant(resolved) {
      currentBoneCount = resolved.boneCount ?? 0;
      lastResolved     = resolved;

      // -------------------------------------------------------------------
      // 1. Build blade geometry from the solved graph.
      // -------------------------------------------------------------------
      const g = buildBladeGeometry(resolved.graph, {
        // Map the bladeWidth gene [0,1] → world half-width (fine grass → broadleaf).
        bladeWidth:      bladeWidthGeneToWorld(resolved.bladeWidth ?? 0.15),
        bladeTaper:      resolved.bladeTaper      ?? 0.5,
        bladeShape:      resolved.bladeShape      ?? 0,
        widestPos:       resolved.widestPos       ?? 0.5,
        crossSectionCurl: resolved.crossSectionCurl ?? 0,
        bladeTwist:      resolved.bladeTwist      ?? 0,
        stemRoundness:   resolved.stemRoundness   ?? 0,
        midribStrength:  resolved.midribStrength  ?? 0.15,
        bladeRaggedness: resolved.bladeRaggedness ?? 0.05,
      });

      // Derive blade count: max distinct blade index in nodeToBlade + 1.
      // nodeToBlade is -1 for unrendered nodes; the highest non-(-1) value
      // is the last blade index, so bladeCount = max + 1.
      let bladeCountFromGeo = 0;
      for (let i = 0; i < g.nodeToBlade.length; i++) {
        if (g.nodeToBlade[i] > bladeCountFromGeo - 1) {
          bladeCountFromGeo = g.nodeToBlade[i] + 1;
        }
      }
      currentBladeCount = bladeCountFromGeo;

      // Dispose previous geometry (slider edits fire often).
      bladeGeometry.dispose();
      bladeGeometry = buildThreeGeometry(g);

      // Update specimen mesh geometry.
      specimenMesh.geometry = bladeGeometry;

      // -------------------------------------------------------------------
      // 1b. Push live color uniforms from the resolved genome.
      // These mirror the wind-uniform pattern so pigment/colorVariation
      // sliders update the clump color without a material rebuild.
      // -------------------------------------------------------------------
      const cu = bladeMaterial.userData.colorUniforms;
      if (cu) {
        const ca = resolved.color || {};
        cu.uChlorophyllVigor.value = ca.chlorophyllVigor ?? 0.6;
        cu.uSenescence.value       = ca.senescence       ?? 0.0;
        cu.uAnthoTint.value        = ca.anthoTint        ?? 0.0;
        cu.uGlaucousness.value     = ca.glaucousness     ?? 0.0;
        cu.uSpeciesHue.value       = ca.speciesHue       ?? 0.30;
        cu.uStarWarm.value         = ca.starWarm         ?? 0.0;
        cu.uStarDark.value         = ca.starDark         ?? 1.0;
        cu.uColorVariation.value   = resolved.colorVariation ?? 0.20;
        if (cu.uVeining) cu.uVeining.value = resolved.veining ?? 0.5;
      }

      // -------------------------------------------------------------------
      // 1c. Grain / inflorescence instances (resolved.foliage → grainMesh).
      // -------------------------------------------------------------------
      updateGrainMesh(resolved.foliage);

      // -------------------------------------------------------------------
      // 2. Sun light + sky — sync to lightDir.
      // -------------------------------------------------------------------
      const lightDirVec = new THREE.Vector3(
        resolved.lightDir[0],
        resolved.lightDir[1],
        resolved.lightDir[2]
      ).normalize();

      setSkyFromLightDir(lightDirVec);
      sunLight.position.copy(lightDirVec.clone().multiplyScalar(50));
      sunLight.target.position.set(0, 0, 0);
      sunLight.target.updateMatrixWorld();

      if (g.vertexCount > 0) {
        const shadowBounds = {
          min: [g.bounds.min[0], Math.max(g.bounds.min[1], 0), g.bounds.min[2]],
          max: g.bounds.max,
        };
        updateShadowCamera(shadowBounds);
      }

      // -------------------------------------------------------------------
      // 3. Ground — always at y=0 (grass bases are at ground level).
      // -------------------------------------------------------------------
      ground.setBaseY(0);

      // -------------------------------------------------------------------
      // 4. Cache bounds.
      // -------------------------------------------------------------------
      lastBounds = g.vertexCount > 0 ? g.bounds : null;

      // -------------------------------------------------------------------
      // 5. Camera auto-frame (first plant only).
      // -------------------------------------------------------------------
      if (firstPlant) {
        const fitBounds = (g.vertexCount > 0 && g.bounds) ? {
          min: [g.bounds.min[0], Math.max(g.bounds.min[1], 0), g.bounds.min[2]],
          max: g.bounds.max,
        } : null;
        const fit = fitBounds
          ? computeFitFromBounds(fitBounds)
          : defaultFit();
        target    = fit.center.clone();
        radius    = fit.fitRadius;
        firstPlant = false;
      }

      // -------------------------------------------------------------------
      // 6. If currently in field mode, rebuild the InstancedMesh so the
      //    field stays in sync with the new genome geometry.
      // -------------------------------------------------------------------
      if (currentViewMode === 'field') {
        activateField();
      }
    },

    /**
     * setViewMode(mode)
     *
     * Toggle between specimen and field views.
     * Disposes the old InstancedMesh (if switching away from field) to avoid
     * GPU resource leaks.
     *
     * @param {'specimen'|'field'} mode
     */
    setViewMode(mode) {
      // Validate the mode BEFORE mutating state so an invalid mode never
      // corrupts currentViewMode.
      if (mode !== 'specimen' && mode !== 'field') {
        console.warn(`viewer: unknown view mode "${mode}", ignoring`);
        return;
      }

      if (mode === currentViewMode) return;
      currentViewMode = mode;

      if (mode === 'specimen') {
        activateSpecimen();
        // Re-frame to clump bounds.
        if (lastBounds) {
          const fitBounds = {
            min: [lastBounds.min[0], Math.max(lastBounds.min[1], 0), lastBounds.min[2]],
            max: lastBounds.max,
          };
          updateShadowCamera(fitBounds);
          const fit = computeFitFromBounds(fitBounds);
          target = fit.center.clone();
          radius = fit.fitRadius;
        }
      } else {
        // mode === 'field'
        activateField();
      }
    },

    /**
     * start()
     * Begin the render loop. Idempotent.
     */
    start() {
      if (loopRunning) return;
      loopRunning = true;
      clock.start();
      frame();
    },

    /**
     * resize()
     * Call when the canvas/window size changes.
     */
    resize() {
      const w = canvas.clientWidth  || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      perspCam.aspect = w / h;
      perspCam.updateProjectionMatrix();
      composer.setSize(w, h);
      updateResolution();
    },

    /**
     * getStats()
     *
     * @returns {{
     *   fps:       number,
     *   triangles: number,
     *   drawCalls: number,
     *   blades:    number,
     *   bones:     number,
     *   viewMode:  string,
     *   resolution: { width: number, height: number },
     * }}
     */
    getStats() {
      return {
        fps:        fpsSmoothEma,
        triangles:  renderer.info.render.triangles,
        drawCalls:  renderer.info.render.calls,
        // In field mode report the instance count; in specimen mode report the
        // real blade count of the single clump (a clump has up to ~12 blades).
        blades:     fieldMesh ? fieldMesh.count : currentBladeCount,
        bones:      currentBoneCount,
        viewMode:   currentViewMode,
        resolution: { width: renderer.domElement.width, height: renderer.domElement.height },
      };
    },

    /**
     * dispose()
     * Stop the render loop and release WebGL resources.
     */
    dispose() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      loopRunning = false;

      canvas.removeEventListener('pointerdown',   onPointerDown);
      canvas.removeEventListener('pointermove',   onPointerMove);
      canvas.removeEventListener('pointerup',     onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel',         onWheel);
      canvas.removeEventListener('contextmenu',   onContextMenu);

      disposeFieldMesh();
      if (grainMesh) { scene.remove(grainMesh); grainMesh.dispose(); grainMesh = null; }
      grainGeo.dispose();
      grainMat.dispose();
      grainDepthMat.dispose();
      bladeGeometry.dispose();
      bladeMaterial.dispose();
      bladeDepthMaterial.dispose();
      sky.material.dispose();
      sky.geometry.dispose();
      composer.dispose();
      sunLight.dispose();
      hemiLight.dispose();
      ground.dispose();
      if (envMapResult) envMapResult.dispose();
      renderer.dispose();
    },

    // -------------------------------------------------------------------------
    // Exposed render-mode surface.
    // bladeMesh exposes the stable specimenMesh object — renderModes.js uses it.
    // renderModes.js overrides apply to specimenMesh.material.  After each mode
    // change we also sync fieldMesh.material = specimenMesh.material so both
    // views see the same override.  activateField() builds the InstancedMesh
    // with specimenMesh.material at construction time, so modes active before
    // the first field switch are also correct.
    // -------------------------------------------------------------------------

    /** The stable blade Mesh object (geometry changes per setPlant; mesh is stable). */
    get bladeMesh() {
      return specimenMesh;
    },

    setRenderMode(mode) {
      if (_renderModeController) {
        _renderModeController.setMode(mode);
        // Sync the field InstancedMesh material so the render-mode override
        // reaches field view too.  specimenMesh.material has already been
        // updated by the controller above.
        if (fieldMesh !== null) {
          fieldMesh.material = specimenMesh.material;
        }
      }
    },

    attachRenderModeController(ctrl) {
      _renderModeController = ctrl;
    },

    /**
     * setRenderStyle(style)
     *
     * Switches the field between geometry (blade InstancedMesh) and billboard
     * (cross-quad billboard InstancedMesh from billboardField.js) rendering.
     * Only affects field view; specimen stays geometry regardless.
     * Disposes the existing field mesh and rebuilds with the new style if
     * currently in field mode.
     *
     * @param {'geometry'|'billboard'} style
     */
    setRenderStyle(style) {
      if (style !== 'geometry' && style !== 'billboard') {
        console.warn(`viewer: unknown render style "${style}", ignoring`);
        return;
      }
      if (style === currentRenderStyle) return;
      currentRenderStyle = style;

      // If currently in field mode, rebuild immediately with the new style.
      if (currentViewMode === 'field') {
        activateField();
      }
    },

    /**
     * setWindEnabled(enabled)
     * Toggles animated wind on/off.
     */
    setWindEnabled(enabled) {
      windEnabled = enabled;
      applyWindUniforms(enabled ? windStrength : 0);
    },

    /**
     * setWindStrength(strength)
     * Sets target wind strength, clamped to [0, 1.5].
     */
    setWindStrength(strength) {
      windStrength = Math.max(WIND_STRENGTH_MIN, Math.min(WIND_STRENGTH_MAX, strength));
      if (windEnabled) {
        applyWindUniforms(windStrength);
      }
    },
  };
}
