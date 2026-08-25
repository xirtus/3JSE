import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {TAARenderPass} from 'three/addons/postprocessing/TAARenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import vertexShader from './sphere.vert.glsl?raw';
import objectFrag from './sphere.frag.glsl?raw';
import groundVert from './ground.vert.glsl?raw';
import groundFrag from './ground.frag.glsl?raw';
import shell from './shell.glsl?raw';   // shape norms + the shell march, shared by both shaders

const fragmentShader = shell + objectFrag;

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.05, 100);
camera.position.set(0, 0.6, 3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const loader = new THREE.TextureLoader().setPath(`${import.meta.env.BASE_URL}textures/`);
const tex = n => {
  const t = loader.load(`bricks_wall_07_${n}_1k.png`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};

// Height is sampled inside raymarch loops, where implicit mip LOD is undefined -> mip garbage.
// No mipmaps = always level 0 = well-defined. Costs some minification aliasing.
const heightTex = tex('height');
heightTex.generateMipmaps = false;
heightTex.minFilter = THREE.LinearFilter;

const uniforms = {
  uBase:    {value: tex('baseColor')},
  uNorm:    {value: tex('normal_gl')},
  uRough:   {value: tex('roughness')},
  uAO:      {value: tex('ambientOcclusion')},
  uHeight:  {value: heightTex},
  uRepeat:  {value: new THREE.Vector2(4, 2)},
  uWorldPerUv:{value: 2*Math.PI/4},
  uShape:   {value: 0},
  uExtent:  {value: 1},
  uDepth:   {value: 0.05},
  uSteps:   {value: 48},
  uRender:  {value: 0},
  uView:    {value: 0},
  uShadow:  {value: 1},
  uDisplace:{value: 0},
  uLight:   {value: new THREE.Vector3(1, 0.8, 0.9)},
};

const material = new THREE.ShaderMaterial({uniforms, vertexShader, fragmentShader});

// [base, dense]. Dense is only for mode 9 - higher looks crisper but the wireframe view turns
// into a solid blob, so ~70k tris is the compromise. repeat/wpu are picked so a brick lands at
// roughly the same physical size on both shapes; curvature is what mode 8 reads.
const SHAPES = [
  {geo: [new THREE.SphereGeometry(1, 128, 64), new THREE.SphereGeometry(1, 256, 128)],
   repeat: [4, 2], wpu: 2*Math.PI/4, shape: 0, extent: 1},
  // 12 triangles. A cube genuinely is 12 triangles - the faces are flat, so uv and position
  // interpolate exactly and the cotangent frame is constant per face. Only mode 4 needs more.
  {geo: [new THREE.BoxGeometry(1.5,1.5,1.5), new THREE.BoxGeometry(1.5,1.5,1.5, 80,80,80)],
   repeat: [1, 1], wpu: 1.5, shape: 1, extent: 0.75},
  // repeat.y = 1.273 makes a brick the same physical size along the axis as around it.
  {geo: [new THREE.CylinderGeometry(1,1,2, 96,1), new THREE.CylinderGeometry(1,1,2, 256,128)],
   repeat: [4, 1.273], wpu: 2*Math.PI/4, shape: 2, extent: 1},
];
let shape = 0;

const mesh = new THREE.Mesh(SHAPES[0].geo[0], material);
scene.add(mesh);
const applyGeometry = () => {
  mesh.geometry = SHAPES[shape].geo[uniforms.uRender.value === DISPLACED ? 1 : 0];
};

// Ground shares the light/shape/extent uniform objects, so it stays in sync for free.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.ShaderMaterial({
    uniforms: {
      uLight: uniforms.uLight, uShape: uniforms.uShape, uExtent: uniforms.uExtent,
      uHeight: uniforms.uHeight, uRepeat: uniforms.uRepeat, uDepth: uniforms.uDepth,
      uWorldPerUv: uniforms.uWorldPerUv, uRender: uniforms.uRender, uSteps: uniforms.uSteps,
    },
    vertexShader: groundVert, fragmentShader: shell + groundFrag,
    transparent: true, depthWrite: false,
  })
);
ground.rotation.x = -Math.PI/2;
ground.position.y = -SHAPES[0].extent;   // sits tangent to the shape, updated on shape change
ground.visible = false;
scene.add(ground);

// UI
const radio = (id, items, cb) => {
  const btns = items.map(([name, title], i) => {
    const b = document.createElement('button');
    b.textContent = name;
    if (title) b.title = title;
    b.onclick = () => { btns.forEach((x,j) => x.classList.toggle('on', i===j)); cb(i); };
    document.getElementById(id).appendChild(b);
    return b;
  });
  btns[0].classList.add('on');
  return btns;
};

const DISPLACED = 3;
const renderBtns = radio('render', [
  ['1. Standard',  'Normal map only - no parallax at all'],
  ['2. POM',       'Parallax occlusion mapping: layer march + lerp of the last two layers'],
  ['3. SPOM',      'Silhouette POM: raymarch the shell in world space. Works on any shape with a norm.'],
  ['4. Displaced', 'Real vertex displacement on a dense mesh'],
], i => {
  uniforms.uRender.value = i;
  uniforms.uDisplace.value = i === DISPLACED ? 1 : 0;
  applyGeometry();
  reset();
});
addEventListener('keydown', e => { const i = '1234'.indexOf(e.key); if (i >= 0) renderBtns[i].click(); });

radio('shape', [['Sphere'], ['Cube'], ['Cylinder']], i => {
  shape = i;
  const s = SHAPES[i];
  uniforms.uRepeat.value.set(s.repeat[0], s.repeat[1]);
  uniforms.uWorldPerUv.value = s.wpu;
  uniforms.uShape.value = s.shape;
  uniforms.uExtent.value = s.extent;
  ground.position.y = -s.extent;
  applyGeometry();
  reset();
});

radio('view', [['Shaded'], ['Normal map'], ['Wireframe']], i => {
  uniforms.uView.value = i;
  material.wireframe = i === 2;
  reset();
});

const check = (id, fn) => {
  const el = document.getElementById(id);
  el.onchange = () => { fn(el.checked); reset(); };
};
check('shadow', v => { uniforms.uShadow.value = v ? 1 : 0; });
check('ground', v => { ground.visible = v; });
check('taa',    v => { taaOn = v; });

const bind = (id, u) => {
  const el = document.getElementById(id), out = document.getElementById(id + '-v');
  const f = () => { uniforms[u].value = +el.value; out.textContent = el.value; };
  el.oninput = () => { f(); reset(); };   // not on the initial f(), reset() isn't defined yet
  f();
};
bind('depth', 'uDepth');
bind('steps', 'uSteps');

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// TAA: TAARenderPass jitters the projection and accumulates one sample per frame, so a still
// view converges to a very clean image while a moving one falls back to a 4-sample supersample.
// Anything that changes the picture has to reset the accumulation, hence reset() everywhere.
const composer = new EffectComposer(renderer);
const taaPass = new TAARenderPass(scene, camera);
taaPass.sampleLevel = 2;
composer.addPass(taaPass);
composer.addPass(new OutputPass());   // the composer target is linear; this does the sRGB encode
let taaOn = false;
const reset = () => { taaPass.accumulate = false; };
controls.addEventListener('change', reset);

// Stats. GPU time needs the timer query extension; Chrome exposes it, Safari does not.
const gl = renderer.getContext();
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let query = null, gpuMs = 0, cpuMs = 0, lastUi = 0;
const el = {tris: document.getElementById('s-tris'), gpu: document.getElementById('s-gpu'), cpu: document.getElementById('s-cpu')};
if (!timer) el.gpu.textContent = 'n/a';

// Light rides the camera, tilted off-axis so the relief always casts visible shading.
const camX = new THREE.Vector3(), camY = new THREE.Vector3();
const frame = () => {
  if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)){
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)){
      gpuMs += (gl.getQueryParameter(query, gl.QUERY_RESULT)/1e6 - gpuMs) * 0.2;  // one query in flight,
    }                                                                             // so this smooths over
    gl.deleteQuery(query);                                                        // every 2nd-3rd frame
    query = null;
  }
  const timing = timer && !query;
  if (timing){ query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }

  const t0 = performance.now();
  controls.update();
  camera.matrixWorld.extractBasis(camX, camY, uniforms.uLight.value);
  uniforms.uLight.value.addScaledVector(camX, 1.0).addScaledVector(camY, 0.55).normalize();
  if (taaOn){ composer.render(); taaPass.accumulate = true; }
  else       renderer.render(scene, camera);
  cpuMs += (performance.now() - t0 - cpuMs) * 0.2;   // JS submit cost, not GPU work

  if (timing) gl.endQuery(timer.TIME_ELAPSED_EXT);

  if (t0 - lastUi > 200){
    lastUi = t0;
    // Straight from the geometry, not renderer.info: info counts lines in wireframe and would
    // also count TAA's repeated scene draws and the composer's fullscreen quads.
    el.tris.textContent = (mesh.geometry.index.count/3).toLocaleString();
    if (timer) el.gpu.textContent = `${gpuMs.toFixed(2)} ms`;
    el.cpu.textContent = `${cpuMs.toFixed(2)} ms`;
  }
};
renderer.setAnimationLoop(frame);
