// test/windGlsl.test.mjs
// Unit tests for windGlsl.js — pure JS / GLSL string exports only.
// Run with: node --test test/windGlsl.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    WIND_UNIFORM_DECLS,
    WIND_FUNCTION_GLSL,
    WIND_UNIFORM_DEFAULTS,
} from '../src/windGlsl.js';

describe('WIND_UNIFORM_DECLS', () => {
    it('is a non-empty string', () => {
        assert.equal(typeof WIND_UNIFORM_DECLS, 'string');
        assert.ok(WIND_UNIFORM_DECLS.length > 0, 'WIND_UNIFORM_DECLS must not be empty');
    });

    it('declares uTime as uniform float', () => {
        assert.ok(WIND_UNIFORM_DECLS.includes('uniform float uTime'),
            'must declare uTime');
    });

    it('declares uWindStrength as uniform float', () => {
        assert.ok(WIND_UNIFORM_DECLS.includes('uniform float uWindStrength'),
            'must declare uWindStrength');
    });

    it('declares uWindDir as uniform vec2', () => {
        assert.ok(WIND_UNIFORM_DECLS.includes('uniform vec2') && WIND_UNIFORM_DECLS.includes('uWindDir'),
            'must declare uWindDir as vec2');
    });
});

describe('WIND_FUNCTION_GLSL — frozen contract §5', () => {
    it('is a non-empty string', () => {
        assert.equal(typeof WIND_FUNCTION_GLSL, 'string');
        assert.ok(WIND_FUNCTION_GLSL.length > 0, 'WIND_FUNCTION_GLSL must not be empty');
    });

    it('defines windOffset with correct signature', () => {
        assert.ok(
            WIND_FUNCTION_GLSL.includes('vec3 windOffset(vec3 worldPos, float swayFactor)'),
            'must define windOffset(vec3 worldPos, float swayFactor) returning vec3'
        );
    });

    it('uses uWindStrength (so strength=0 → no movement)', () => {
        assert.ok(WIND_FUNCTION_GLSL.includes('uWindStrength'),
            'must reference uWindStrength so calm wind (0) produces zero displacement');
    });

    it('uses uWindDir', () => {
        assert.ok(WIND_FUNCTION_GLSL.includes('uWindDir'),
            'must reference uWindDir for directional sway');
    });

    it('uses uTime', () => {
        assert.ok(WIND_FUNCTION_GLSL.includes('uTime'),
            'must reference uTime for animated traveling gust');
    });

    it('returns a vec3', () => {
        assert.ok(WIND_FUNCTION_GLSL.includes('return'),
            'function must have a return statement');
        assert.ok(WIND_FUNCTION_GLSL.includes('vec3 windOffset'),
            'return type must be vec3');
    });

    it('has balanced braces', () => {
        const opens  = (WIND_FUNCTION_GLSL.match(/\{/g) || []).length;
        const closes = (WIND_FUNCTION_GLSL.match(/\}/g) || []).length;
        assert.equal(opens, closes, 'WIND_FUNCTION_GLSL must have balanced braces');
    });

    // Calm→exact-zero invariant: every amplitude term must multiply uWindStrength
    // so that when uWindStrength==0 all displacement collapses to zero (§5).
    it('every amplitude term multiplies uWindStrength (calm→zero invariant)', () => {
        // Extract the lines that declare amplitude variables (primaryAmp, turbAmp, crossAmp).
        // Each must contain uWindStrength as a multiplicand.
        const ampLines = WIND_FUNCTION_GLSL
            .split('\n')
            .filter(line => /Amp\s*=/.test(line));

        assert.ok(ampLines.length >= 1,
            'must have at least one amplitude variable declaration');

        for (const line of ampLines) {
            assert.ok(line.includes('uWindStrength'),
                `amplitude line must multiply uWindStrength for calm→zero guarantee:\n  ${line.trim()}`);
        }
    });

    it('does not use a bone-rig or bone texture (grass path)', () => {
        assert.ok(!WIND_FUNCTION_GLSL.includes('uBoneTex'),
            'grass wind must not reference bone texture — it uses per-vertex swayFactor');
        assert.ok(!WIND_FUNCTION_GLSL.includes('fetchBone'),
            'grass wind must not reference bone fetch — no skeletal rig');
    });

    // Grass-specific tuning: exponent must be ≤1.0 (near-uniform blade bend).
    it('uses near-uniform ease exponent (≤1.0) for grass blade bend', () => {
        // pow(swayFactor, X) where X <= 1.0 gives near-uniform bend.
        // Accept 1.0 or any value below it; reject the old tree value of 1.5.
        const powMatch = WIND_FUNCTION_GLSL.match(/pow\s*\(\s*swayFactor\s*,\s*([\d.]+)\s*\)/);
        if (powMatch) {
            const exponent = parseFloat(powMatch[1]);
            assert.ok(exponent <= 1.0,
                `swayFactor ease exponent must be ≤1.0 for near-uniform grass bend; got ${exponent}`);
        } else {
            // No pow call — linear flex is also acceptable (implicitly exponent=1.0).
            // Verify swayFactor is still used.
            assert.ok(WIND_FUNCTION_GLSL.includes('swayFactor'),
                'must reference swayFactor for per-vertex wind flex');
        }
    });

    // Grass-specific tuning: primary amplitude must be higher than the old tree value (0.7).
    it('primary amplitude is raised vs tree baseline (>0.7) for grass flex', () => {
        // Find the primaryAmp declaration and extract the multiplier.
        const match = WIND_FUNCTION_GLSL.match(/primaryAmp\s*=\s*uWindStrength\s*\*\s*flex\s*\*\s*([\d.]+)/);
        assert.ok(match,
            'must declare primaryAmp = uWindStrength * flex * <number>');
        const amp = parseFloat(match[1]);
        assert.ok(amp > 0.7,
            `primaryAmp multiplier must be >0.7 (grass flexes more than trees); got ${amp}`);
    });

    it('no GLSL string contains template-literal backticks that would break JS string', () => {
        assert.ok(
            !WIND_FUNCTION_GLSL.includes('`'),
            'WIND_FUNCTION_GLSL must not contain backticks — they close the JS template literal'
        );
    });
});

describe('WIND_UNIFORM_DEFAULTS', () => {
    it('is a plain object', () => {
        assert.equal(typeof WIND_UNIFORM_DEFAULTS, 'object');
        assert.ok(WIND_UNIFORM_DEFAULTS !== null);
    });

    it('has uTime defaulting to 0', () => {
        assert.equal(WIND_UNIFORM_DEFAULTS.uTime, 0);
    });

    it('has uWindStrength defaulting to 0 (calm)', () => {
        assert.equal(WIND_UNIFORM_DEFAULTS.uWindStrength, 0,
            'uWindStrength=0 means calm — no displacement on load');
    });

    it('has uWindDir as a 2-element array', () => {
        assert.ok(Array.isArray(WIND_UNIFORM_DEFAULTS.uWindDir),
            'uWindDir must be an array (no Three.js dependency)');
        assert.equal(WIND_UNIFORM_DEFAULTS.uWindDir.length, 2,
            'uWindDir must have exactly 2 components [x, z]');
    });

    it('has no Three.js objects (dependency-free)', () => {
        for (const [key, val] of Object.entries(WIND_UNIFORM_DEFAULTS)) {
            assert.ok(
                val === null || typeof val !== 'object' || Array.isArray(val) || val.isVector2 === undefined,
                `${key} must not be a Three.js object — windGlsl.js must remain dependency-free`
            );
        }
    });

    it('WIND_UNIFORM_DEFAULTS.uWindStrength === 0 (exact calm check)', () => {
        // Redundant with the test above but explicit per acceptance criteria.
        assert.strictEqual(WIND_UNIFORM_DEFAULTS.uWindStrength, 0);
    });
});
