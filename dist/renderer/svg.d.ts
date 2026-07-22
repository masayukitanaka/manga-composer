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
import type { Page } from "../ast.js";
import { Rect, LayoutedPanel, LayoutedSpeech } from "../layout/slicing.js";
import { XmlElement } from "./xml.js";
export declare class SVGRenderer {
    page: Page;
    panels: LayoutedPanel[];
    speeches: LayoutedSpeech[];
    source_dir: string;
    constructor(page: Page, panels: LayoutedPanel[], speeches?: LayoutedSpeech[] | null, source_dir?: string | null);
    render(): string;
    private _render_panel;
    private _render_rect_panel;
    private _render_skewed_panel;
    private _render_image;
    private _render_text;
    _draw_text_block(parent: XmlElement, rect: Rect, text: string, font_size: number, direction: string, color: string, align?: string, padding?: number): void;
    private _render_speech;
    private _render_monologue;
}
export declare function _wrap_horizontal_text(text: string, chars_per_line: number): string[];
export declare function _vertical_glyph_offset(ch: string, font_size: number): [number, number];
//# sourceMappingURL=svg.d.ts.map