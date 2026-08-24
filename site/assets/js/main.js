/**
 * 3JSE hero viewport — a live scene that mimics the editor's Viewport:
 * the three-face cube mark, floating satellites, particle field, grid.
 * Pauses off-screen, respects prefers-reduced-motion, degrades to the SVG banner.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const canvas = document.getElementById("hero-canvas");
if (!canvas || !window.WebGLRenderingContext) {
  document.body.classList.add("no-webgl");
} else {
  try {
    boot();
  } catch (err) {
    console.warn("3JSE hero: WebGL unavailable —", err);
    document.body.classList.add("no-webgl");
  }
}

function boot() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewport = canvas.parentElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d11);
  scene.fog = new THREE.Fog(0x0c0d11, 10, 36);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 70);
  camera.position.set(0, 1.15, 8.2);
  camera.lookAt(0, 0.1, 0);

  scene.add(new THREE.HemisphereLight(0x99aacc, 0x0c0d11, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(5, 8, 6);
  scene.add(key);

  // --- grid (editor viewport floor) ---
  const grid = new THREE.GridHelper(26, 52, 0x22d3ee, 0x1b2436);
  grid.position.y = -2.7;
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  scene.add(grid);

  // --- the mark: a cube whose three visible faces carry the brand ---
  const face = (hex) =>
    new THREE.MeshStandardMaterial({
      color: 0x0e1118,
      emissive: new THREE.Color(hex),
      emissiveIntensity: 1.25,
      roughness: 0.32,
      metalness: 0.12,
    });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 1.75, 1.75),
    [face(0xe879f9), face(0x10131a), face(0x22d3ee), face(0x10131a), face(0x818cf8), face(0x10131a)] // +x, -x, +y, -y, +z, -z
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(1.75, 1.75, 1.75),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
  );
  const mark = new THREE.Group();
  mark.add(box, edges);
  mark.position.y = 0.1;
  scene.add(mark);

  // --- floating satellites ---
  const sats = [
    { geo: new THREE.OctahedronGeometry(0.26), color: 0x22d3ee, r: 2.9, speed: 0.42, phase: 0.0, y0: 0.7 },
    { geo: new THREE.IcosahedronGeometry(0.2), color: 0xe879f9, r: 3.6, speed: -0.3, phase: 2.1, y0: -0.4 },
    { geo: new THREE.BoxGeometry(0.3, 0.3, 0.3), color: 0x818cf8, r: 3.2, speed: 0.36, phase: 4.2, y0: 1.6 },
    { geo: new THREE.TetrahedronGeometry(0.24), color: 0x22d3ee, r: 4.1, speed: -0.24, phase: 1.2, y0: 0.2 },
    { geo: new THREE.OctahedronGeometry(0.18), color: 0x818cf8, r: 2.5, speed: 0.55, phase: 5.4, y0: -1.1 },
    { geo: new THREE.IcosahedronGeometry(0.15), color: 0xe879f9, r: 4.5, speed: 0.2, phase: 3.3, y0: 1.1 },
    { geo: new THREE.BoxGeometry(0.22, 0.22, 0.22), color: 0x22d3ee, r: 3.9, speed: -0.33, phase: 0.8, y0: -1.7 },
  ];
  const satellites = sats.map((s) => {
    const m = new THREE.Mesh(
      s.geo,
      new THREE.MeshStandardMaterial({
        color: 0x0e1118,
        emissive: new THREE.Color(s.color),
        emissiveIntensity: 0.95,
        roughness: 0.4,
        metalness: 0.15,
      })
    );
    scene.add(m);
    return { ...s, mesh: m, rot: Math.random() * 3 };
  });

  // --- particles ---
  const COUNT = 420;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = -2.5 + Math.random() * 8;
    pos[i * 3 + 2] = -6 + Math.random() * 10;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.05,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(particles);

  // --- dim wireframe backdrop ---
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(9, 1),
    new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, transparent: true, opacity: 0.055 })
  );
  wire.position.set(0, 1.6, -11);
  scene.add(wire);

  // --- post: bloom for the glow ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  };
  resize();
  window.addEventListener("resize", resize);

  // --- pointer parallax ---
  const pointer = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // --- animation loop (paused when off-screen or tab hidden) ---
  const clock = new THREE.Clock();
  let visible = true, raf = 0;

  const tick = () => {
    const t = clock.getElapsedTime();
    mark.rotation.y = t * 0.22 + Math.PI * 0.25;
    mark.rotation.x = 0.3 + Math.sin(t * 0.35) * 0.07;
    mark.position.y = 0.1 + Math.sin(t * 0.7) * 0.12;

    for (const s of satellites) {
      const a = t * s.speed + s.phase;
      s.mesh.position.set(Math.cos(a) * s.r, s.y0 + Math.sin(t * 0.9 + s.phase) * 0.5, Math.sin(a) * s.r * 0.8);
      s.mesh.rotation.x += s.rot * 0.004;
      s.mesh.rotation.y += s.rot * 0.003;
    }

    particles.rotation.y = t * 0.02;
    wire.rotation.y = t * 0.03;
    wire.rotation.x = t * 0.012;

    camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (1.15 + pointer.y * 0.6 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.1, 0);

    composer.render();
    raf = requestAnimationFrame(tick);
  };

  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const start = () => { if (visible && !raf) { clock.getDelta(); raf = requestAnimationFrame(tick); } };

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }, { threshold: 0 }).observe(canvas);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  if (reduced) {
    clock.getDelta();
    tick();
    stop();
  } else {
    start();
  }
}
