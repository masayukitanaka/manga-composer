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
export declare function renderBalloon(renderer: SVGRenderer, parent: XmlElement, speech: LayoutedSpeech): void;
//# sourceMappingURL=balloonOutline.d.ts.map