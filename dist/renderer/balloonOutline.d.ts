/**
 * Hand-drawn balloon outline geometry helpers.
 *
 * Port of the balloon-outline pipeline in
 * manga-gen-python/src/manga_gen/renderer/svg.py (v6+): every shape is a single
 * closed <path> built from a jittered point list, with the tail spliced
 * directly into the outline. Ported literally, preserving Python function and
 * variable names.
 *
 * The seeded jitter uses src/prng.ts (mulberry32), NOT CPython's Mersenne
 * Twister — so the exact wobble differs from the Python reference by design
 * (docs/PORTING_NOTES.md). Output is internally deterministic. The SVG-diff
 * harness relaxes balloon <path> comparison to bounding-box level.
 */
import type { SVGRenderer } from "./svg.js";
import type { XmlElement } from "./xml.js";
import type { LayoutedSpeech } from "../layout/slicing.js";
/** Where a balloon's tail attaches to the outline, and where its tip lands. */
export interface BalloonTail {
    /** Point on the balloon outline the tail grows from (mm, page coords). */
    rootX: number;
    rootY: number;
    /** Tail tip (mm, page coords) — `tailLength` out along the root's radial. */
    tipX: number;
    tipY: number;
}
/**
 * Resolve a balloon's tail root and tip in page mm, or null when it has none
 * (`has_tail` false, or a `thought` balloon, which draws a trail of circles
 * instead of a fused tail).
 *
 * This is the function an editor should use to place a tail handle: it runs the
 * same seeded outline generation as `renderBalloon`, so the returned root sits
 * exactly on the drawn (jittered) outline.
 */
export declare function resolveBalloonTail(speech: LayoutedSpeech): BalloonTail | null;
export declare function renderBalloon(renderer: SVGRenderer, parent: XmlElement, speech: LayoutedSpeech): void;
//# sourceMappingURL=balloonOutline.d.ts.map