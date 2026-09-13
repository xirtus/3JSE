import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { annotateContacts, gaussianSmooth, majorityVote, thresholdContacts, toeVelocities } from "./contactLabels.js";

describe("toeVelocities", () => {
  it("finite-differences per-frame speed (m/s)", () => {
    const pos = [new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(2, 0, 0)];
    const v = toeVelocities(pos, 1);
    expect(v[0]).toBe(0);
    expect(v[1]).toBeCloseTo(1, 5);
    expect(v[2]).toBeCloseTo(1, 5);
  });
});

describe("thresholdContacts", () => {
  it("flags only frames both slow and low", () => {
    const pos = [new Vector3(0, 0.05, 0), new Vector3(0, 0.05, 0), new Vector3(0, 0.5, 0)];
    const vel = new Float32Array([0, 0.01, 0.01]);
    const c = thresholdContacts(pos, vel, 0.3, 0.1);
    expect(c[0]).toBe(1);
    expect(c[1]).toBe(1);
    expect(c[2]).toBe(0); // still but held high → not a contact
  });
});

describe("majorityVote", () => {
  it("removes a single-frame spike", () => {
    const signal = new Float32Array([0, 1, 0, 1, 0]);
    expect(Array.from(majorityVote(signal, 3))).toEqual([0, 0, 1, 0, 0]);
  });
});

describe("gaussianSmooth", () => {
  it("blurs a delta while preserving a constant signal", () => {
    const delta = gaussianSmooth(new Float32Array([0, 0, 1, 0, 0]), 1);
    expect(delta[1]!).toBeGreaterThan(0);
    expect(delta[2]!).toBeLessThan(1);
    const constant = gaussianSmooth(new Float32Array([1, 1, 1, 1, 1]), 1.5);
    for (let i = 0; i < constant.length; i++) expect(constant[i]!).toBeGreaterThan(0.99);
  });
});

describe("annotateContacts", () => {
  it("labels a stationary grounded middle section as contact, moving ends as flight", () => {
    const pos: Vector3[] = [];
    for (let i = 0; i < 60; i++) {
      // frames 20..40: planted (still, y≈0); otherwise swinging (fast, y≈0.4)
      const planted = i >= 20 && i <= 40;
      const y = planted ? 0.02 : 0.4;
      const x = planted ? 0 : i * 0.05;
      pos.push(new Vector3(x, y, 0));
    }
    const c = annotateContacts(pos, { dt: 1 / 60, velocityThreshold: 0.3, heightThreshold: 0.1, majorityVoteWidth: 5, smoothingSigma: 1.5 });
    expect(c[30]!).toBeGreaterThan(0.9);
    expect(c[5]!).toBeLessThan(0.1);
    expect(c[55]!).toBeLessThan(0.1);
  });
});
