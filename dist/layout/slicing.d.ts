/**
 * Recursive space-partitioning layout engine.
 *
 * Port of manga-gen-python/src/manga_gen/layout/slicing.py.
 *
 * Ported LITERALLY, preserving Python method/variable names and branch order:
 * the shared-border / skew geometry is bug-fragile and any "cleanup" risks
 * changing float rounding or branch order in ways that surface as a
 * subtly-misplaced corner in one example.
 */
import { type Page, type Length, type PanelAttrs, type ImageLayer, type SpeechNode, type BalloonAttrs, type MonologueAttrs } from "../ast.js";
export declare class Rect {
    x: number;
    y: number;
    w: number;
    h: number;
    constructor(x: number, y: number, w: number, h: number);
}
/**
 * A skewed straight line for a shared vertical border.
 * x_at(y) computes the X position of this panel's edge at height y.
 */
export declare class SkewLine {
    base_x: number;
    mid_y: number;
    skew_angle: number;
    constructor(base_x: number, // X of this panel's own boundary at mid_y
    mid_y: number, // Shared reference Y (midpoint of the taller panel)
    skew_angle: number);
    x_at(y: number): number;
}
/**
 * A skewed horizontal border line.
 * y_at(x) computes the Y position at horizontal position x.
 */
export declare class SkewHLine {
    base_y: number;
    mid_x: number;
    skew_angle: number;
    constructor(base_y: number, // Y of the gutter centre at mid_x
    mid_x: number, // X reference (midpoint of panel width)
    skew_angle: number);
    y_at(x: number): number;
}
/** A panel with computed layout (absolute coordinates). */
export declare class LayoutedPanel {
    id: string;
    rect: Rect;
    attrs: PanelAttrs;
    draw_left: boolean;
    draw_right: boolean;
    draw_top: boolean;
    draw_bottom: boolean;
    adjacent_left_skew: number;
    adjacent_right_skew: number;
    adjacent_top_skew: number;
    adjacent_bottom_skew: number;
    shared_left_x: number | null;
    shared_right_x: number | null;
    shared_top_y: number | null;
    shared_bottom_y: number | null;
    shared_left_skewline: SkewLine | null;
    shared_right_skewline: SkewLine | null;
    shared_left_skewline_y: [number, number] | null;
    shared_right_skewline_y: [number, number] | null;
    shared_top_skewline: SkewHLine | null;
    shared_bottom_skewline: SkewHLine | null;
    shared_top_endpoints: [number, number, number, number] | null;
    shared_bottom_endpoints: [number, number, number, number] | null;
    speeches: SpeechNode[];
    _top_border_skewline?: SkewHLine;
    constructor(id: string, rect: Rect, attrs: PanelAttrs, speeches?: SpeechNode[]);
}
/** A balloon/monologue element with computed layout. */
export declare class LayoutedSpeech {
    kind: string;
    id: string | null;
    rect: Rect;
    attrs: BalloonAttrs | MonologueAttrs;
    has_tail: boolean;
    constructor(kind: string, // "balloon" | "monologue"
    id: string | null, rect: Rect, attrs: BalloonAttrs | MonologueAttrs, has_tail?: boolean);
}
/**
 * Resolve one image layer's placement rect against its owning panel's rect.
 * Mirrors balloon anchor placement (_ANCHOR_POS_POINTS growth direction) but
 * panel-relative, with %/mm lengths and no `margin`. See .private/IMAGE_LAYERS.md.
 *
 * `%` resolves against the panel dimension of the same axis: width-axis fields
 * (x/width/dx) → r.w, height-axis fields (y/height/dy) → r.h. Layers with no
 * placement attrs resolve to the panel rect itself (full-bleed = legacy image).
 */
export declare function resolveImageLayerRect(layer: ImageLayer, r: Rect): Rect;
export declare const TEXT_CHAR_W_FACTOR = 1;
export declare const TEXT_LINE_H_FACTOR = 1.4;
/** True for glyphs that occupy a roughly full-width (square) cell. */
export declare function isFullWidthChar(ch: string): boolean;
/** Advance width (mm) of one character at the given font size + tracking. */
export declare function charAdvance(ch: string, font_size: number, letter_spacing?: number): number;
/** Total advance width (mm) of a string. */
export declare function measureTextWidth(text: string, font_size: number, letter_spacing?: number): number;
/**
 * Count the lines that `text` wraps into at a fixed content width (mm). Mirrors
 * the renderer's width-based wrapping (`_wrap_horizontal_styled`): `\n` is a
 * hard break, space-less text breaks anywhere, space-separated text wraps on
 * word boundaries (a too-long word is hard-split). Plain text is enough since
 * inline styles don't change glyph advance in our model.
 */
export declare function countWrappedLines(text: string, max_width: number, font_size: number, letter_spacing?: number): number;
/**
 * Resolve a `line_height` Length to an absolute line advance (mm). A "%" unit
 * is a multiplier of the font size (the parser stores `1.4`/`140%` alike as
 * {value:1.4, unit:"%"}); an "mm" unit is used as-is. Shared by layout and the
 * renderer so box estimate and drawing agree.
 */
export declare function resolveLineHeight(lineHeight: Length, font_size: number): number;
/** Rough width/height estimate (mm) for a text block. */
export declare function _estimate_text_box_size(text: string, font_size: number, direction: string, lineHeight?: Length, letterSpacing?: number, wrap?: boolean): [number, number];
export declare class LayoutEngine {
    page: Page;
    panels: LayoutedPanel[];
    speeches: LayoutedSpeech[];
    private _inherited_skew;
    constructor(page: Page);
    layout(): LayoutedPanel[];
    private _layout_children;
    private _compute_sizes;
    private _get_size_spec;
    private _layout_node;
    private _push_inherited_skew;
    private _resolve_shared_borders;
    private _adjust_skewline_y_for_slanted_top;
    private _unify_skewline_mid_y;
    private _link_lr;
    private _link_tb;
    private _resolve_speech_elements;
}
//# sourceMappingURL=slicing.d.ts.map