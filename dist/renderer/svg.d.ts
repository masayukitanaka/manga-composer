/**
 * SVG renderer with image and skew support.
 *
 * Port of manga-gen-python/src/manga_gen/renderer/svg.py — ported LITERALLY,
 * preserving Python method/variable names, branch order, and the explanatory
 * comments. The _render_panel skew / corner-intersection block is the most
 * bug-fragile code in the whole port; keeping the original variable names and
 * comments is what makes a future corner-case bug tractable.
 *
 * Balloon rendering (_render_balloon + outline helpers) lives in
 * balloonOutline.ts. Number formatting: we do NOT reproduce Python's str(float)
 * output (20.0 vs 20); the SVG-diff harness compares numbers with tolerance.
 */
import type { Page, SpeechAttrs } from "../ast.js";
import { Rect, LayoutedPanel, LayoutedSpeech } from "../layout/slicing.js";
import type { SkewLine, SkewHLine } from "../layout/slicing.js";
import { XmlElement } from "./xml.js";
import type { ImageLoader } from "./imageLoader.js";
type Point = [number, number];
/**
 * Intersection of a skewed horizontal border line (`hsl`) with a skewed vertical
 * border line (`vsl`), used to close a skewed panel's corner exactly where the
 * top/bottom gutter meets the left/right gutter. Returns null when the lines are
 * (near-)parallel (`1 - tan_h·tan_v ≈ 0`), in which case the caller keeps its
 * existing endpoint. This is the exact formula that was previously inlined
 * verbatim at six corner sites in _render_skewed_panel.
 */
export declare function _skewline_intersection(hsl: SkewHLine, vsl: SkewLine): Point | null;
export declare class SVGRenderer {
    page: Page;
    panels: LayoutedPanel[];
    speeches: LayoutedSpeech[];
    imageLoader: ImageLoader | null;
    /**
     * @param imageLoader resolves panel `image:` paths to base64 data. Pure/
     *   browser-safe: the Node CLI passes a filesystem-backed loader
     *   (createNodeImageLoader), a browser host passes its own. When `null`,
     *   panels with images render a placeholder box.
     */
    constructor(page: Page, panels: LayoutedPanel[], speeches?: LayoutedSpeech[] | null, imageLoader?: ImageLoader | null);
    render(): string;
    private _render_panel;
    /** Render a panel's description as centered, wrapped, muted placeholder text. */
    private _render_description;
    private _render_rect_panel;
    private _render_skewed_panel;
    /**
     * The skewed panel's outline as clipped polygon points — the exact shape the
     * fill paints and the borders trace. Shared so an image clip can match the
     * frame instead of falling back to an axis-aligned rect (which cut images on a
     * flat line across a slanted top/bottom edge).
     */
    private _skew_panel_polygon;
    /** Fill the clipped panel trapezoid with the panel background. */
    private _skew_fill;
    /** Register the per-panel clipPath and attach it to the border group. */
    private _skew_clip;
    /** Draw the four (possibly-skewed) border edges. */
    private _skew_borders;
    /**
     * Draw a panel's image layers back-to-front (array order = bottom→top; SVG's
     * later-wins painting matches). Each layer fits into its own placement rect
     * (resolveImageLayerRect); a layer with no placement attrs fills the panel,
     * matching the legacy single-`image` behavior. A missing/failing layer draws
     * its own placeholder so the other layers still render.
     */
    private _render_image_layers;
    private _render_one_image_layer;
    private _render_text;
    _draw_text_block(parent: XmlElement, rect: Rect, attrs: SpeechAttrs, color: string): void;
    private _render_speech;
    private _render_monologue;
}
export interface StyledChar {
    ch: string;
    italic: boolean;
    bold: boolean;
}
/** Expand marked-up text into a flat per-character style array. */
export declare function _style_chars(text: string, base: {
    italic: boolean;
    bold: boolean;
}): StyledChar[];
/**
 * Wrap styled chars into lines at a fixed content width. A thin adapter over the
 * shared `wrapItems` primitive (see slicing.ts) so the drawn line breaks always
 * match the box-size estimate's line count. `\n` is a hard break; a space-less
 * paragraph (CJK) breaks anywhere; a space-separated paragraph wraps on word
 * boundaries. Returns a list of lines (each a StyledChar[]).
 */
export declare function _wrap_horizontal_styled(chars: StyledChar[], max_width: number, font_size: number, letter_spacing?: number): StyledChar[][];
/** Group adjacent same-style chars in a line into runs for <tspan> output. */
export declare function _group_styled_runs(line: StyledChar[]): {
    text: string;
    italic: boolean;
    bold: boolean;
}[];
/** Whether a character should be rotated 90° when drawn in vertical text. */
export declare function _vertical_glyph_rotate(ch: string): boolean;
/** Whether a character is a small kana that gets shrunk + shifted top-right. */
export declare function _vertical_glyph_is_small_kana(ch: string): boolean;
/**
 * SVG `transform` for a vertically-set glyph drawn at column-center `px` and
 * baseline `py` (with text-anchor="middle"), or "" if none is needed:
 *   - rotate glyphs (ー, dashes, brackets) 90° about their visual center, so the
 *     horizontal stroke reads vertical and stays centered on the column axis;
 *   - small kana (ゃゅょっ…) shrink and nudge toward the top-right of the cell;
 *   - top-right punctuation (、。) nudge toward the top-right.
 */
export declare function _vertical_glyph_transform(ch: string, font_size: number, px: number, py: number): string;
export {};
//# sourceMappingURL=svg.d.ts.map