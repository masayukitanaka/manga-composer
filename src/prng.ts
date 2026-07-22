/**
 * Deterministic PRNG for balloon-outline jitter.
 *
 * NOTE: This does NOT replicate CPython's Mersenne Twister stream. Balloon
 * outline jitter will differ in exact wobble pattern from the Python reference
 * (manga-gen-python), while remaining internally deterministic (same input
 * always produces the same output). This is intentional — see
 * docs/PORTING_NOTES.md ("決定論的PRNGはCPythonのMersenne Twisterと非互換").
 *
 * Mirrors the Python side's _speech_seed (md5 of the resolved rect + shape,
 * truncated to 32 bits) and _SeededJitter (a .uniform(lo, hi) wrapper) so the
 * balloonOutline call sites port structurally unchanged.
 */

import { createHash } from "node:crypto";
import type { Rect } from "./layout/slicing.js";

/**
 * Deterministic integer seed for a balloon's outline jitter, derived from the
 * resolved rect and shape only (not text) so editing a balloon's text doesn't
 * change its outline. Truncated to 32 bits for the PRNG below.
 */
export function speechSeed(rect: Rect, shape: string): number {
  const key = `${rect.x.toFixed(4)},${rect.y.toFixed(4)},${rect.w.toFixed(4)},${rect.h.toFixed(4)},${shape}`;
  const digest = createHash("md5").update(key, "utf-8").digest("hex");
  // First 8 hex chars → 32-bit unsigned int (matches int(digest[:8], 16)).
  return parseInt(digest.slice(0, 8), 16) >>> 0;
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
