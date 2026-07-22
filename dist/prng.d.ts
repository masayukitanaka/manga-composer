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
import type { Rect } from "./layout/slicing.js";
/**
 * Deterministic integer seed for a balloon's outline jitter, derived from the
 * resolved rect and shape only (not text) so editing a balloon's text doesn't
 * change its outline. Truncated to 32 bits for the PRNG below.
 */
export declare function speechSeed(rect: Rect, shape: string): number;
/**
 * Small deterministic PRNG (mulberry32) — isolated from any global RNG state
 * so balloon jitter never affects (or is affected by) other randomness. Same
 * .uniform(lo, hi) surface as the Python _SeededJitter.
 */
export declare class SeededJitter {
    private state;
    constructor(seed: number);
    private next;
    uniform(lo: number, hi: number): number;
}
//# sourceMappingURL=prng.d.ts.map