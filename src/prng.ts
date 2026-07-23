/**
 * Deterministic PRNG for balloon-outline jitter.
 *
 * NOTE: This does NOT replicate CPython's Mersenne Twister stream. Balloon
 * outline jitter will differ in exact wobble pattern from the Python reference
 * (manga-gen-python), while remaining internally deterministic (same input
 * always produces the same output). This is intentional — see
 * docs/PORTING_NOTES.md ("決定論的PRNGはCPythonのMersenne Twisterと非互換").
 *
 * The seed is derived from the resolved rect + shape via a pure-JS 32-bit hash
 * (FNV-1a). It used to use node:crypto MD5, but the jitter stream was already
 * declared non-reference-compatible (above), so a Node-free hash costs nothing
 * in fidelity and lets this module run in the browser (docs/SPEC.md §12 API-1).
 * Same input → same seed, so a balloon's outline stays stable across renders.
 */

import type { Rect } from "./layout/slicing.js";

/**
 * Deterministic integer seed for a balloon's outline jitter, derived from the
 * resolved rect and shape only (not text) so editing a balloon's text doesn't
 * change its outline. 32-bit unsigned, feeds the PRNG below.
 */
export function speechSeed(rect: Rect, shape: string): number {
  const key = `${rect.x.toFixed(4)},${rect.y.toFixed(4)},${rect.w.toFixed(4)},${rect.h.toFixed(4)},${shape}`;
  // FNV-1a 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Small deterministic PRNG (mulberry32) — isolated from any global RNG state
 * so balloon jitter never affects (or is affected by) other randomness. Same
 * .uniform(lo, hi) surface as the Python _SeededJitter.
 */
export class SeededJitter {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  private next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}
