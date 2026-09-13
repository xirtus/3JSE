import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createFootLockingState, updateFootLockingState, type FootLockingParams } from "./footLocking.js";

const DT = 1 / 60;
const params: FootLockingParams = { contactHeight: 0, lockDistance: 0.05, unlockDistance: 0.5, blendTime: 0.1 };

describe("updateFootLockingState", () => {
  it("locks on a planted, in-contact foot and holds the contact against input motion", () => {
    const s = createFootLockingState(new Vector3(0, 0, 0));
    updateFootLockingState(s, new Vector3(0, 0, 0), true, params, DT);
    expect(s.locked).toBe(true);

    // Input toe slides 0..0.3 over 30 frames; the locked output must not follow it.
    for (let i = 0; i < 30; i++) {
      updateFootLockingState(s, new Vector3((i + 1) * 0.01, 0, 0), true, params, DT);
    }
    expect(s.locked).toBe(true);
    expect(Math.abs(s.position.x)).toBeLessThan(0.01);
    expect(Number.isFinite(s.position.y)).toBe(true);
  });

  it("unlocks when the source animation drops contact", () => {
    const s = createFootLockingState(new Vector3(0, 0, 0));
    updateFootLockingState(s, new Vector3(0, 0, 0), true, params, DT);
    expect(s.locked).toBe(true);
    updateFootLockingState(s, new Vector3(0.01, 0, 0), false, params, DT);
    expect(s.locked).toBe(false);
  });

  it("unlocks when the input strays beyond unlockDistance even while in contact", () => {
    const s = createFootLockingState(new Vector3(0, 0, 0));
    updateFootLockingState(s, new Vector3(0, 0, 0), true, params, DT);
    expect(s.locked).toBe(true);
    updateFootLockingState(s, new Vector3(1, 0, 0), true, params, DT);
    expect(s.locked).toBe(false);
  });

  it("snaps the locked contact to contactHeight", () => {
    const s = createFootLockingState(new Vector3(0, 0.3, 0));
    updateFootLockingState(s, new Vector3(0.01, 0.3, 0), true, { ...params, contactHeight: 0.05 }, DT);
    expect(s.locked).toBe(true);
    expect(s.contact.y).toBeCloseTo(0.05, 5);
  });

  it("stays finite across a long alternating contact sequence", () => {
    const s = createFootLockingState(new Vector3(0, 0, 0));
    let contact = true;
    for (let i = 0; i < 400; i++) {
      if (i % 30 === 0) contact = !contact;
      const x = Math.sin(i * 0.05) * 0.3;
      updateFootLockingState(s, new Vector3(x, 0, 0), contact, params, DT);
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.position.z)).toBe(true);
    }
  });
});
