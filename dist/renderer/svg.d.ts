/**
 * SVG renderer with image and skew support.
 *
 * Port of manga-gen-python/src/manga_gen/renderer/svg.py — ported LITERALLY,
 * preserving Python method/variable names, branch order, and the explanatory
 * comments (docs/PORTING_GUIDE.md §4 Stage 6). The _render_panel skew /
 * corner-intersection block is the most bug-fragile code in the whole port;
 * keeping the original variable names and comments is what makes a future
 * corner-case bug tractable.
 *
 * Balloon rendering (_render_balloon + outline helpers) lives in
 * balloonOutline.ts. Number formatting: we do NOT reproduce Python's str(float)
 * output (20.0 vs 20); the SVG-diff harness compares numbers with tolerance
 * (docs/PORTING_NOTES.md).
 */
import type { Page, SpeechAttrs } from "../ast.js";
import { Rect, LayoutedPanel, LayoutedSpeech } from "../layout/slicing.js";
import { XmlElement } from "./xml.js";
import type { ImageLoader } from "./imageLoader.js";
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
    private _render_rect_panel;
    private _render_skewed_panel;
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
 * Wrap styled chars into lines. Mirrors `_wrap_horizontal_text`: `\n` is a hard
 * break; a paragraph with no spaces (CJK) wraps by char count; a space-separated
 * paragraph wraps on word boundaries. Returns a list of lines (each a
 * StyledChar[]).
 */
export declare function _wrap_horizontal_styled(chars: StyledChar[], max_width: number, font_size: number, letter_spacing?: number): StyledChar[][];
/** Group adjacent same-style chars in a line into runs for <tspan> output. */
export declare function _group_styled_runs(line: StyledChar[]): {
    text: string;
    italic: boolean;
    bold: boolean;
}[];
export declare function _wrap_horizontal_text(text: string, chars_per_line: number): string[];
export declare function _vertical_glyph_offset(ch: string, font_size: number): [number, number];
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
//# sourceMappingURL=svg.d.ts.map