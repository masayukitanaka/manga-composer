import { describe, it, expect } from "vitest";
import { SeededJitter, speechSeed } from "../../src/prng.js";
import { Rect } from "../../src/layout/slicing.js";

describe("prng (deterministic, not CPython-compatible by design)", () => {
  it("SeededJitter is deterministic for the same seed", () => {
    const a = new SeededJitter(12345);
    const b = new SeededJitter(12345);
    for (let i = 0; i < 10; i++) {
      expect(a.uniform(-1, 1)).toBe(b.uniform(-1, 1));
    }
  });

  it("different seeds produce different streams", () => {
    const a = new SeededJitter(1);
    const b = new SeededJitter(2);
    expect(a.uniform(0, 1)).not.toBe(b.uniform(0, 1));
  });

  it("uniform stays within [lo, hi)", () => {
    const j = new SeededJitter(999);
    for (let i = 0; i < 1000; i++) {
      const v = j.uniform(-0.06, 0.06);
      expect(v).toBeGreaterThanOrEqual(-0.06);
      expect(v).toBeLessThanOrEqual(0.06);
    }
  });

  it("speechSeed depends on rect + shape, not text", () => {
    const r1 = new Rect(10, 20, 30, 40);
    const r2 = new Rect(10, 20, 30, 40);
    expect(speechSeed(r1, "oval")).toBe(speechSeed(r2, "oval"));
    expect(speechSeed(r1, "oval")).not.toBe(speechSeed(r1, "shout"));
    expect(speechSeed(r1, "oval")).not.toBe(speechSeed(new Rect(11, 20, 30, 40), "oval"));
  });

  it("speechSeed is a 32-bit unsigned int", () => {
    const seed = speechSeed(new Rect(1.5, 2.5, 3.5, 4.5), "jagged");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
