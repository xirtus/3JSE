// =============================================================================
// renderModes.js — viewport render-mode switcher for the grass blade viewer
//
// Supported modes:
//   lit        — full PBR (restored real material)
//   unlit      — MeshBasicMaterial, albedo-only; flat grass-green representative
//   wireframe  — MeshBasicMaterial wireframe; instancing-safe
//   normals    — MeshNormalMaterial; instancing-safe
//   ao         — grayscale debug: blade mesh uses vertex 'ao' attribute
//
// Override mechanism:
//   mesh.material = overrideMat is set on bladeMesh.  Real material cached on
//   first use and restored on 'lit'.  Override materials are lazily created and
//   reused across setMode calls.
//   scene.overrideMaterial is NOT used so ground / sky are unaffected.
//
// Regeneration robustness:
//   bladeMesh is a STABLE object (same JS reference across setPlant calls —
//   only geometry changes, not the mesh object itself).  Cached real material
//   remains valid across setPlant; re-applying the current mode after setPlant
//   is handled by viewer.js calling setRenderMode again via
//   attachRenderModeController.
//
// Usage:
//   import { createRenderModeController } from './renderModes.js';
//   const ctrl = createRenderModeController({ bladeMesh });
//   ctrl.setMode('wireframe');
//   ctrl.getMode();   // → 'wireframe'
//   ctrl.dispose();
// =============================================================================

import * as THREE from 'three';

// Flat blade color used in unlit mode — a representative mid-green so blades
// read clearly without the PBR shader.
const BLADE_UNLIT_COLOR = new THREE.Color(0.25, 0.55, 0.15);

/**
 * createRenderModeController({ bladeMesh })
 *
 * @param {object}     opts
 * @param {THREE.Mesh} opts.bladeMesh  stable blade mesh object
 *
 * @returns {{ setMode(mode:string):void, getMode():string, dispose():void }}
 */
export function createRenderModeController({ bladeMesh }) {
  // ---------------------------------------------------------------------------
  // Real material cache — populated on first setMode away from 'lit'
  // ---------------------------------------------------------------------------
  let realBladeMaterial = null;

  // ---------------------------------------------------------------------------
  // Override material cache — created lazily, reused on subsequent calls
  // ---------------------------------------------------------------------------
  let unlitBladeMat  = null;
  let wireBladeMat   = null;
  let normalBladeMat = null;
  let aoBladeMat     = null;

  let currentMode = 'lit';

  // ---------------------------------------------------------------------------
  // Cache real material — safe to call multiple times (idempotent)
  // ---------------------------------------------------------------------------
  function cacheRealMaterial() {
    if (realBladeMaterial === null) {
      realBladeMaterial = bladeMesh.material;
    }
  }

  // ---------------------------------------------------------------------------
  // Restore real material (lit mode)
  // ---------------------------------------------------------------------------
  function restoreLit() {
    if (realBladeMaterial !== null) {
      bladeMesh.material = realBladeMaterial;
    }
  }

  // ---------------------------------------------------------------------------
  // Unlit mode — MeshBasicMaterial, flat representative green
  // ---------------------------------------------------------------------------
  function applyUnlit() {
    if (unlitBladeMat === null) {
      unlitBladeMat = new THREE.MeshBasicMaterial({
        color:      BLADE_UNLIT_COLOR,
        side:       THREE.DoubleSide,
      });
    }
    bladeMesh.material = unlitBladeMat;
  }

  // ---------------------------------------------------------------------------
  // Wireframe mode — MeshBasicMaterial wireframe
  //   MeshBasicMaterial supports InstancedMesh natively.
  // ---------------------------------------------------------------------------
  function applyWireframe() {
    if (wireBladeMat === null) {
      wireBladeMat = new THREE.MeshBasicMaterial({
        color:     0x88ffaa,
        wireframe: true,
      });
    }
    bladeMesh.material = wireBladeMat;
  }

  // ---------------------------------------------------------------------------
  // Normals mode — MeshNormalMaterial (supports InstancedMesh natively)
  // ---------------------------------------------------------------------------
  function applyNormals() {
    if (normalBladeMat === null) {
      normalBladeMat = new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
      });
    }
    bladeMesh.material = normalBladeMat;
  }

  // ---------------------------------------------------------------------------
  // AO mode — grayscale debug: reads vertex 'ao' attribute emitted by
  //   buildBladeGeometry() — [0.35,1] base-darker ambient occlusion per vertex.
  // ---------------------------------------------------------------------------
  function buildAoBladeMat() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      // Declare ao attribute and varying
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */`
attribute float ao;
varying float vAo;
#include <common>
`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */`
#include <begin_vertex>
vAo = ao;
`
      );
      // Fragment: output grayscale ao
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */`
varying float vAo;
#include <common>
`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */`
gl_FragColor = vec4(vec3(vAo), 1.0);
`
      );
    };
    return mat;
  }

  function applyAo() {
    if (aoBladeMat === null) {
      aoBladeMat = buildAoBladeMat();
    }
    bladeMesh.material = aoBladeMat;
  }

  // ---------------------------------------------------------------------------
  // setMode — dispatch to per-mode apply functions
  // ---------------------------------------------------------------------------
  function setMode(mode) {
    // Cache real material before any override (idempotent)
    cacheRealMaterial();

    currentMode = mode;

    switch (mode) {
      case 'lit':
        restoreLit();
        break;
      case 'unlit':
        applyUnlit();
        break;
      case 'wireframe':
        applyWireframe();
        break;
      case 'normals':
        applyNormals();
        break;
      case 'ao':
        applyAo();
        break;
      default:
        console.warn(`renderModes: unknown mode "${mode}", falling back to lit`);
        restoreLit();
        currentMode = 'lit';
    }
  }

  // ---------------------------------------------------------------------------
  // getMode
  // ---------------------------------------------------------------------------
  function getMode() {
    return currentMode;
  }

  // ---------------------------------------------------------------------------
  // dispose — release override materials (real material is owned by viewer)
  // ---------------------------------------------------------------------------
  function dispose() {
    unlitBladeMat  && unlitBladeMat.dispose();
    wireBladeMat   && wireBladeMat.dispose();
    normalBladeMat && normalBladeMat.dispose();
    aoBladeMat     && aoBladeMat.dispose();

    unlitBladeMat  = null;
    wireBladeMat   = null;
    normalBladeMat = null;
    aoBladeMat     = null;
    realBladeMaterial = null;
  }

  return { setMode, getMode, dispose };
}
