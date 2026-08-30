/**
 * `transpose` — mirror a parsed .manga page left↔right (rtl⇄ltr).
 *
 * Spec: .private/TRANSPOSE_COMMAND.md. This module is the pure, I/O-free core:
 * it takes a parsed `Page` and returns a NEW transformed `Page` plus a list of
 * warnings. The CLI (cli.ts) handles source/image output; nothing here reads or
 * writes files, parses, or serializes.
 *
 * Design promise (do not break existing behavior): this never mutates its input
 * — it deep-clones first — and only rewrites attributes with a left/right sense.
 * Everything else is copied verbatim, so a round-trip through serialize stays
 * valid and untouched fields are byte-identical.
 *
 * SAFE CORE (implemented here, no layout needed):
 *   - page.direction rtl⇄ltr, padding_left⇄padding_right
 *   - align start⇄end (row/col/speech), anchor_pos left⇄right
 *   - skew_left⇄skew_right and sign-flip all skews
 *   - offset_left⇄offset_right, border_left⇄border_right, margin_left⇄margin_right
 *   - dx sign-flip (speech + image layers), image flip_h toggle
 *   - image-layer `x` in `%` units (panel-relative, resolvable without layout)
 *   - tail_angle horizontal mirror
 *   - text_direction vertical⇄horizontal (only when opts.text)
 *
 * DEFERRED (needs layout; emits a warning and keeps the value unchanged):
 *   - balloon/monologue absolute `x` (mm) mirror — needs page/box width
 *   - image-layer `x` in `mm` — needs panel width
 * See .private/TRANSPOSE_COMMAND.md §6/§7.
 */
import type { Page, PageConfig } from "./ast.js";
export interface TransposeOptions {
    /** Target reading direction. "flip" = invert current; else force target. */
    direction: "flip" | "ltr" | "rtl";
    /** Also swap text_direction vertical⇄horizontal. Default false. */
    text: boolean;
    /** Toggle each image layer's flip_h. Default true. */
    flipImages: boolean;
    /** Swap/sign-flip skews. Default true. */
    skew: boolean;
    /** Mirror tail_angle. Default true. */
    tail: boolean;
    /** Swap align (start⇄end) and anchor_pos left⇄right. Default true. */
    align: boolean;
    /** Skip coordinate mirroring (absolute/relative x). Default false. */
    keepCoords: boolean;
}
export declare function defaultTransposeOptions(): TransposeOptions;
export interface TransposeResult {
    page: Page;
    warnings: string[];
}
/** Whether the requested target differs from the current direction. */
export declare function directionChanges(cfg: PageConfig, opts: TransposeOptions): boolean;
/**
 * Transpose (mirror left↔right) a parsed page. Returns a new page + warnings.
 * When `opts.direction` names a target the page already has, this is a no-op
 * (returns a clone unchanged) — mirroring twice would wrongly re-flip it.
 */
export declare function transposePage(page: Page, opts: TransposeOptions): TransposeResult;
//# sourceMappingURL=transpose.d.ts.map