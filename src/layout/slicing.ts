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

import {
  type Page,
  type LayoutNode,
  type RowNode,
  type ColNode,
  type Length,
  type PanelAttrs,
  type ImageLayer,
  type SpeechNode,
  type BalloonAttrs,
  type MonologueAttrs,
} from "../ast.js";
import { LayoutError } from "../errors.js";
import { plainText } from "../renderer/richtext.js";

const radians = (deg: number): number => (deg * Math.PI) / 180;

export class Rect {
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {}
}

/**
 * A skewed straight line for a shared vertical border.
 * x_at(y) computes the X position of this panel's edge at height y.
 */
export class SkewLine {
  constructor(
    public base_x: number, // X of this panel's own boundary at mid_y
    public mid_y: number, // Shared reference Y (midpoint of the taller panel)
    public skew_angle: number, // degrees — shared between both sides
  ) {}

  x_at(y: number): number {
    if (this.skew_angle === 0.0) return this.base_x;
    return this.base_x + (y - this.mid_y) * Math.tan(radians(this.skew_angle));
  }
}

/**
 * A skewed horizontal border line.
 * y_at(x) computes the Y position at horizontal position x.
 */
export class SkewHLine {
  constructor(
    public base_y: number, // Y of the gutter centre at mid_x
    public mid_x: number, // X reference (midpoint of panel width)
    public skew_angle: number, // degrees — positive = right side lower
  ) {}

  y_at(x: number): number {
    if (this.skew_angle === 0.0) return this.base_y;
    return this.base_y + (x - this.mid_x) * Math.tan(radians(this.skew_angle));
  }
}

/**
 * Shared vertical border (left or right edge of a panel) with an adjacent panel.
 * Groups the correlated fields that used to be loose on LayoutedPanel
 * (shared_left_x, shared_left_skewline, shared_left_skewline_y, draw_left,
 * adjacent_left_skew) so their relationship is explicit: e.g. `skewline` present
 * implies `skewlineY` is meaningful.
 */
export class VBorder {
  draw = true; // false suppresses this edge (avoids double-drawing a flat shared border)
  adjacentSkew = 0.0; // skew angle contributed by the neighbouring panel
  x: number | null = null; // shared boundary X (gutter middle), null when not shared
  skewline: SkewLine | null = null; // diagonal descriptor for a skewed gutter
  skewlineY: [number, number] | null = null; // Y range over which `skewline` is valid
}

/**
 * Shared horizontal border (top or bottom edge). Mirror of VBorder for the
 * top/bottom axis: `skewline` is a SkewHLine and the endpoint tuple replaces the
 * Y-range span.
 */
export class HBorder {
  draw = true;
  adjacentSkew = 0.0;
  y: number | null = null; // shared boundary Y (gutter middle)
  skewline: SkewHLine | null = null;
  endpoints: [number, number, number, number] | null = null; // (left_x, left_y, right_x, right_y)
}

/** A panel with computed layout (absolute coordinates). */
export class LayoutedPanel {
  id: string;
  rect: Rect;
  attrs: PanelAttrs;
  // Shared-border state, one value object per edge. Written by the shared-border
  // resolution passes, read by the renderer.
  left = new VBorder();
  right = new VBorder();
  top = new HBorder();
  bottom = new HBorder();
  // balloon/monologue nested inside this panel (AST nodes)
  speeches: SpeechNode[] = [];

  constructor(id: string, rect: Rect, attrs: PanelAttrs, speeches: SpeechNode[] = []) {
    this.id = id;
    this.rect = rect;
    this.attrs = attrs;
    this.speeches = speeches;
  }
}

/** A balloon/monologue element with computed layout. */
export class LayoutedSpeech {
  constructor(
    public kind: string, // "balloon" | "monologue"
    public id: string | null,
    public rect: Rect,
    public attrs: BalloonAttrs | MonologueAttrs,
    public has_tail = false,
  ) {}
}

// (anchor_pos) -> function(rect) -> (base_x, base_y, gx, gy)
const _ANCHOR_POS_POINTS: Record<
  string,
  (r: Rect) => [number, number, number, number]
> = {
  top_left: (r) => [r.x, r.y, 1, 1],
  top_right: (r) => [r.x + r.w, r.y, -1, 1],
  bottom_left: (r) => [r.x, r.y + r.h, 1, -1],
  bottom_right: (r) => [r.x + r.w, r.y + r.h, -1, -1],
  center: (r) => [r.x + r.w / 2, r.y + r.h / 2, 0, 0],
  top: (r) => [r.x + r.w / 2, r.y, 0, 1],
  bottom: (r) => [r.x + r.w / 2, r.y + r.h, 0, -1],
  left: (r) => [r.x, r.y + r.h / 2, 1, 0],
  right: (r) => [r.x + r.w, r.y + r.h / 2, -1, 0],
};

/**
 * Resolve one image layer's placement rect against its owning panel's rect.
 * Mirrors balloon anchor placement (_ANCHOR_POS_POINTS growth direction) but
 * panel-relative, with %/mm lengths and no `margin`. See .private/IMAGE_LAYERS.md.
 *
 * `%` resolves against the panel dimension of the same axis: width-axis fields
 * (x/width/dx) → r.w, height-axis fields (y/height/dy) → r.h. Layers with no
 * placement attrs resolve to the panel rect itself (full-bleed = legacy image).
 */
export function resolveImageLayerRect(layer: ImageLayer, r: Rect): Rect {
  const wLen = (l: Length | null, fallback: number): number =>
    l === null ? fallback : l.unit === "%" ? (l.value * r.w) / 100 : l.value;
  const hLen = (l: Length | null, fallback: number): number =>
    l === null ? fallback : l.unit === "%" ? (l.value * r.h) / 100 : l.value;

  const width = wLen(layer.width, r.w);
  const height = hLen(layer.height, r.h);

  const point_fn = _ANCHOR_POS_POINTS[layer.anchorPos] ?? _ANCHOR_POS_POINTS.center;
  const [base_x, base_y, gx, gy] = point_fn(r);

  let x: number;
  let y: number;
  if (gx === -1) x = base_x - width;
  else if (gx === 0) x = base_x - width / 2;
  else x = base_x;
  if (gy === -1) y = base_y - height;
  else if (gy === 0) y = base_y - height / 2;
  else y = base_y;

  // x/y are panel-relative (origin = panel top-left), independent per-axis
  // overrides of anchor_pos.
  if (layer.x !== null) x = r.x + (layer.x.unit === "%" ? (layer.x.value * r.w) / 100 : layer.x.value);
  if (layer.y !== null) y = r.y + (layer.y.unit === "%" ? (layer.y.value * r.h) / 100 : layer.y.value);

  x += layer.dx.unit === "%" ? (layer.dx.value * r.w) / 100 : layer.dx.value;
  y += layer.dy.unit === "%" ? (layer.dy.value * r.h) / 100 : layer.dy.value;

  return new Rect(x, y, width, height);
}

const _DEFAULT_SPEECH_W = 30.0;
const _DEFAULT_SPEECH_H = 15.0;

// Shared sizing constants — MUST match renderer/svg.ts's _draw_text_block.
export const TEXT_CHAR_W_FACTOR = 1.0;
export const TEXT_LINE_H_FACTOR = 1.4;

// Advance width of one glyph as a fraction of font size. CJK / full-width glyphs
// are ~square (1.0); Latin/ASCII and most narrow punctuation average ~0.5. This
// is a coarse model (no font metrics), but it stops proportional Latin text from
// wrapping as if every glyph were full-width. Used by both wrapping and the box
// size estimate so they agree.
const TEXT_CJK_W_FACTOR = 1.0;
const TEXT_LATIN_W_FACTOR = 0.5;

/** True for glyphs that occupy a roughly full-width (square) cell. */
export function isFullWidthChar(ch: string): boolean {
  const c = ch.codePointAt(0);
  if (c === undefined) return false;
  return (
    (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
    (c >= 0x2e80 && c <= 0x303e) || // CJK radicals, Kangxi, punctuation
    (c >= 0x3041 && c <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (c >= 0x3400 && c <= 0x4dbf) || // CJK ext A
    (c >= 0x4e00 && c <= 0x9fff) || // CJK unified
    (c >= 0xa000 && c <= 0xa4cf) || // Yi
    (c >= 0xac00 && c <= 0xd7a3) || // Hangul syllables
    (c >= 0xf900 && c <= 0xfaff) || // CJK compat ideographs
    (c >= 0xfe30 && c <= 0xfe4f) || // CJK compat forms
    (c >= 0xff00 && c <= 0xff60) || // Fullwidth forms
    (c >= 0xffe0 && c <= 0xffe6) || // Fullwidth signs
    (c >= 0x20000 && c <= 0x3fffd) // CJK ext B+ (supplementary)
  );
}

/** Advance width (mm) of one character at the given font size + tracking. */
export function charAdvance(ch: string, font_size: number, letter_spacing = 0.0): number {
  const factor = isFullWidthChar(ch) ? TEXT_CJK_W_FACTOR : TEXT_LATIN_W_FACTOR;
  return font_size * factor + letter_spacing;
}

/** Total advance width (mm) of a string. */
export function measureTextWidth(text: string, font_size: number, letter_spacing = 0.0): number {
  let w = 0;
  for (const ch of text) w += charAdvance(ch, font_size, letter_spacing);
  return w;
}

/** Element predicates + advance for generic width-based wrapping. */
export interface WrapOps<T> {
  advance: (t: T) => number; // width (mm) of one element
  isNewline: (t: T) => boolean;
  isSpace: (t: T) => boolean;
  space: () => T; // a space element, inserted when rejoining words
}

/**
 * Width-based line wrapping over an arbitrary element sequence. The single
 * source of truth shared by the renderer (`_wrap_horizontal_styled`, over styled
 * chars) and the layout box estimate (`countWrappedLines`, over plain chars) so
 * their line counts can never drift.
 *
 * Rules: an `isNewline` element is a hard break (dropped, starts a new line, and
 * an empty paragraph yields an empty line); with `max_width` non-finite/≤0
 * wrapping is disabled and each paragraph is one line; a paragraph with no space
 * element breaks anywhere by accumulated width; a space-containing paragraph
 * wraps on word boundaries, hard-splitting a single word wider than the line.
 */
export function wrapItems<T>(items: T[], max_width: number, ops: WrapOps<T>): T[][] {
  const noWrap = !Number.isFinite(max_width) || max_width <= 0;
  const widthOf = (xs: T[]): number => xs.reduce((w, x) => w + ops.advance(x), 0);

  // Split into paragraphs on newline elements (delimiters dropped).
  const paras: T[][] = [];
  let cur: T[] = [];
  for (const it of items) {
    if (ops.isNewline(it)) {
      paras.push(cur);
      cur = [];
    } else {
      cur.push(it);
    }
  }
  paras.push(cur);

  const lines: T[][] = [];
  for (const para of paras) {
    if (para.length === 0) {
      lines.push([]);
      continue;
    }
    if (noWrap) {
      lines.push(para);
      continue;
    }
    if (!para.some(ops.isSpace)) {
      // No spaces (CJK): break anywhere, accumulating width.
      let line: T[] = [];
      let w = 0;
      for (const c of para) {
        const a = ops.advance(c);
        if (line.length > 0 && w + a > max_width) {
          lines.push(line);
          line = [];
          w = 0;
        }
        line.push(c);
        w += a;
      }
      if (line.length) lines.push(line);
      continue;
    }
    // Word wrap for space-separated text.
    const words: T[][] = [];
    let word: T[] = [];
    for (const c of para) {
      if (ops.isSpace(c)) {
        words.push(word);
        word = [];
      } else {
        word.push(c);
      }
    }
    words.push(word);

    let current: T[] = [];
    for (let w0 of words) {
      // A single word wider than the line: hard-split it by width.
      while (widthOf(w0) > max_width) {
        if (current.length) {
          lines.push(current);
          current = [];
        }
        let cut = 0;
        let w = 0;
        for (let i = 0; i < w0.length; i++) {
          const a = ops.advance(w0[i]);
          if (cut > 0 && w + a > max_width) break;
          w += a;
          cut = i + 1;
        }
        lines.push(w0.slice(0, cut));
        w0 = w0.slice(cut);
      }
      const candidate = current.length > 0 ? [...current, ops.space(), ...w0] : w0;
      if (widthOf(candidate) <= max_width) {
        current = candidate;
      } else {
        if (current.length) lines.push(current);
        current = w0;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Count the lines that `text` wraps into at a fixed content width (mm). A thin
 * adapter over `wrapItems` (over the plain characters), so it can never disagree
 * with the renderer's actual wrapping. Plain text is enough since inline styles
 * don't change glyph advance in our model.
 */
export function countWrappedLines(
  text: string,
  max_width: number,
  font_size: number,
  letter_spacing = 0.0,
): number {
  const chars = [...text];
  const lines = wrapItems(chars, max_width, {
    advance: (ch) => charAdvance(ch, font_size, letter_spacing),
    isNewline: (ch) => ch === "\n",
    isSpace: (ch) => ch === " ",
    space: () => " ",
  });
  return Math.max(1, lines.length);
}

/**
 * Resolve a `line_height` Length to an absolute line advance (mm). A "%" unit
 * is a multiplier of the font size (the parser stores `1.4`/`140%` alike as
 * {value:1.4, unit:"%"}); an "mm" unit is used as-is. Shared by layout and the
 * renderer so box estimate and drawing agree.
 */
export function resolveLineHeight(lineHeight: Length, font_size: number): number {
  if (lineHeight.unit === "mm") return lineHeight.value;
  return font_size * lineHeight.value; // "%"/unitless multiplier
}

/** Rough width/height estimate (mm) for a text block. */
export function _estimate_text_box_size(
  text: string,
  font_size: number,
  direction: string,
  lineHeight: Length = { value: TEXT_LINE_H_FACTOR, unit: "%" },
  letterSpacing = 0.0,
  wrap = true,
): [number, number] {
  // Inline markup (<i>/<b>) must not inflate the character count.
  const plain = plainText(text);
  if (!plain) {
    return [_DEFAULT_SPEECH_W, _DEFAULT_SPEECH_H];
  }

  const MARGIN = 1.6;
  const ASPECT = 1.8; // target height / width ratio for vertical text
  const char_w = font_size * TEXT_CHAR_W_FACTOR + letterSpacing;
  const line_h = resolveLineHeight(lineHeight, font_size);
  const n = plain.length;

  // wrap=false: no auto-wrap — the renderer breaks only at `\n`, so the box is
  // sized to exactly those lines (longest paragraph = width; line count =
  // height). The box may still be overflowed, but this keeps it sensible.
  if (!wrap) {
    const paras = plain.split("\n");
    const longest = paras.reduce((m, p) => Math.max(m, [...p].length), 0);
    if (direction === "vertical") {
      // Each paragraph is one column; columns run right→left.
      const w = line_h * Math.max(1, paras.length) * MARGIN;
      const h = char_w * Math.max(1, longest) * MARGIN;
      return [w, h];
    }
    const w = char_w * Math.max(1, longest) * MARGIN;
    const h = line_h * Math.max(1, paras.length) * MARGIN;
    return [w, h];
  }

  // Longest unbreakable run: a space-separated token (a word) can only wrap at
  // its ends, so the auto-sized box must be wide enough to hold the longest one
  // — otherwise the renderer hard-splits it mid-word. Space-less CJK breaks
  // anywhere, so it imposes no floor. Measured in mm (real glyph advances).
  let longest_token_w = 0;
  for (const para of plain.split("\n")) {
    if (!para.includes(" ")) continue;
    for (const word of para.split(" ")) {
      longest_token_w = Math.max(longest_token_w, measureTextWidth(word, font_size, letterSpacing));
    }
  }

  if (direction === "vertical") {
    // Vertical CJK: keep the character-count model (glyphs stack full-width).
    let longest_token = 0;
    for (const para of plain.split("\n")) {
      if (!para.includes(" ")) continue;
      for (const word of para.split(" ")) longest_token = Math.max(longest_token, word.length);
    }
    let chars_per_col = Math.max(1, Math.round(Math.sqrt((ASPECT * n * line_h) / char_w)));
    chars_per_col = Math.max(chars_per_col, longest_token);
    const cols = Math.max(1, Math.ceil(n / chars_per_col));
    const w = line_h * cols * MARGIN;
    const h = char_w * Math.min(n, chars_per_col) * MARGIN;
    return [w, h];
  }

  // Horizontal: pick a target line width from the total text width (a squarish
  // block), floored to the longest word, then get the real wrapped line count.
  const total_w = measureTextWidth(plain, font_size, letterSpacing);
  let target_w = Math.sqrt(total_w * line_h); // area-based squarish target
  target_w = Math.max(target_w, longest_token_w);
  const lines = countWrappedLines(plain, target_w, font_size, letterSpacing);
  const w = target_w * MARGIN;
  const h = lines * line_h * MARGIN;
  return [w, h];
}

export class LayoutEngine {
  page: Page;
  panels: LayoutedPanel[] = [];
  speeches: LayoutedSpeech[] = [];
  private _inherited_skew: Record<string, number> = {
    skew_left: 0.0,
    skew_right: 0.0,
    skew_top: 0.0,
    skew_bottom: 0.0,
  };

  constructor(page: Page) {
    this.page = page;
  }

  layout(): LayoutedPanel[] {
    const cfg = this.page.config;
    const pad_top = cfg.paddingTop !== null ? cfg.paddingTop : cfg.padding;
    const pad_bottom = cfg.paddingBottom !== null ? cfg.paddingBottom : cfg.padding;
    const pad_left = cfg.paddingLeft !== null ? cfg.paddingLeft : cfg.padding;
    const pad_right = cfg.paddingRight !== null ? cfg.paddingRight : cfg.padding;
    const inner = new Rect(
      pad_left,
      pad_top,
      cfg.widthMm - pad_left - pad_right,
      cfg.heightMm - pad_top - pad_bottom,
    );

    this._layout_children(this.page.children, inner, "vertical", this.page.config.gutter);

    this._resolve_shared_borders();
    this._resolve_speech_elements();

    return this.panels;
  }

  private _layout_children(
    nodes: LayoutNode[],
    bounds: Rect,
    axis: "vertical" | "horizontal",
    gutter: number,
  ): void {
    if (nodes.length === 0) return;

    const sizes = this._compute_sizes(nodes, bounds, axis, gutter);

    if (axis === "horizontal" && this.page.config.direction === "rtl") {
      let offset = bounds.w; // Start from right edge
      for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];
        const size = sizes[idx];
        offset -= size; // Move left by panel width
        const child_rect = new Rect(bounds.x + offset, bounds.y, size, bounds.h);
        offset -= gutter; // Move left by gutter
        this._layout_node(node, child_rect);
      }
    } else {
      let offset = 0.0;
      for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];
        const size = sizes[idx];
        let child_rect: Rect;
        if (axis === "vertical") {
          child_rect = new Rect(bounds.x, bounds.y + offset, bounds.w, size);
        } else {
          child_rect = new Rect(bounds.x + offset, bounds.y, size, bounds.h);
        }
        offset += size + gutter;
        this._layout_node(node, child_rect);
      }
    }
  }

  private _compute_sizes(
    nodes: LayoutNode[],
    bounds: Rect,
    axis: "vertical" | "horizontal",
    gutter: number,
  ): number[] {
    const total_gutter = gutter * (nodes.length - 1);
    const available = (axis === "vertical" ? bounds.h : bounds.w) - total_gutter;

    let fixed_total = 0.0;
    let percent_total = 0.0;
    let auto_count = 0;

    for (const node of nodes) {
      const size_spec = this._get_size_spec(node, axis);
      if (size_spec === null) {
        auto_count += 1;
      } else if (size_spec.unit === "mm") {
        fixed_total += size_spec.value;
      } else if (size_spec.unit === "%") {
        percent_total += size_spec.value;
      } else {
        auto_count += 1;
      }
    }

    if (percent_total > 100) {
      throw new LayoutError(`Percentage total (${percent_total}%) exceeds 100%`);
    }

    const percent_space = available * (percent_total / 100);
    const remaining = available - fixed_total - percent_space;

    if (remaining < 0) {
      throw new LayoutError(
        `Size specifications exceed available space: ` +
          `fixed=${fixed_total}mm, percent=${percent_space}mm, available=${available}mm`,
      );
    }

    const auto_size = auto_count > 0 ? remaining / auto_count : 0;

    const sizes: number[] = [];
    for (const node of nodes) {
      const size_spec = this._get_size_spec(node, axis);
      if (size_spec === null || size_spec.unit === "auto") {
        sizes.push(auto_size);
      } else if (size_spec.unit === "mm") {
        sizes.push(size_spec.value);
      } else if (size_spec.unit === "%") {
        sizes.push((available * size_spec.value) / 100);
      }
    }
    return sizes;
  }

  private _get_size_spec(node: LayoutNode, _axis: "vertical" | "horizontal"): Length | null {
    if (node.kind === "row") return node.height;
    if (node.kind === "col") return node.width;
    return null; // PanelNode → auto
  }

  private _layout_node(node: LayoutNode, rect: Rect): void {
    if (node.kind === "panel") {
      const inh = this._inherited_skew;
      const attrs = node.attrs;
      // Apply inherited skew to panels that don't set their own value.
      const merged: PanelAttrs = {
        ...attrs,
        skewLeft: attrs.skewLeft !== 0.0 ? attrs.skewLeft : inh.skew_left,
        skewRight: attrs.skewRight !== 0.0 ? attrs.skewRight : inh.skew_right,
        skewTop: attrs.skewTop !== 0.0 ? attrs.skewTop : inh.skew_top,
        skewBottom: attrs.skewBottom !== 0.0 ? attrs.skewBottom : inh.skew_bottom,
      };
      this.panels.push(new LayoutedPanel(node.id, rect, merged, [...node.speeches]));
    } else if (node.kind === "row") {
      const child_gutter = node.gutter !== null ? node.gutter : this.page.config.gutter;
      const inner = new Rect(
        rect.x + node.marginLeft,
        rect.y + node.marginTop,
        rect.w - node.marginLeft - node.marginRight,
        rect.h - node.marginTop - node.marginBottom,
      );
      const prev = this._push_inherited_skew(node);
      this._layout_children(node.children, inner, "horizontal", child_gutter);
      this._inherited_skew = prev;
    } else if (node.kind === "col") {
      const child_gutter = node.gutter !== null ? node.gutter : this.page.config.gutter;
      const inner = new Rect(
        rect.x + node.marginLeft,
        rect.y + node.marginTop,
        rect.w - node.marginLeft - node.marginRight,
        rect.h - node.marginTop - node.marginBottom,
      );
      const prev = this._push_inherited_skew(node);
      this._layout_children(node.children, inner, "vertical", child_gutter);
      this._inherited_skew = prev;
    }
  }

  private _push_inherited_skew(node: RowNode | ColNode): Record<string, number> {
    const prev = { ...this._inherited_skew };
    const nw = { ...this._inherited_skew };
    const map: Record<string, number | null> = {
      skew_left: node.skewLeft,
      skew_right: node.skewRight,
      skew_top: node.skewTop,
      skew_bottom: node.skewBottom,
    };
    for (const key of ["skew_left", "skew_right", "skew_top", "skew_bottom"]) {
      const val = map[key];
      if (val !== null && val !== undefined) {
        nw[key] = val;
      }
    }
    this._inherited_skew = nw;
    return prev;
  }

  private _resolve_shared_borders(): void {
    const EPSILON = 0.01;
    const max_gutter = 20.0;

    for (let i = 0; i < this.panels.length; i++) {
      const panel_a = this.panels[i];
      for (let j = i + 1; j < this.panels.length; j++) {
        const panel_b = this.panels[j];
        const ra = panel_a.rect;
        const rb = panel_b.rect;

        // ── Left-right adjacency ──────────────────────────────────────
        const overlap_top = Math.max(ra.y, rb.y);
        const overlap_bottom = Math.min(ra.y + ra.h, rb.y + rb.h);
        const y_overlap = overlap_bottom - overlap_top;

        if (y_overlap > EPSILON) {
          // panel_a is to the left of panel_b
          let gap = rb.x - (ra.x + ra.w);
          if (0 <= gap && gap < max_gutter) {
            this._link_lr(panel_a, panel_b, ra, rb, gap, overlap_top, overlap_bottom);
          }
          // panel_b is to the left of panel_a
          gap = ra.x - (rb.x + rb.w);
          if (0 <= gap && gap < max_gutter) {
            this._link_lr(panel_b, panel_a, rb, ra, gap, overlap_top, overlap_bottom);
          }
        }

        // ── Top-bottom adjacency ──────────────────────────────────────
        const x_overlap = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
        if (x_overlap > EPSILON) {
          // panel_a is above panel_b
          let gap = rb.y - (ra.y + ra.h);
          if (0 <= gap && gap < max_gutter) {
            this._link_tb(panel_a, panel_b, ra, rb, gap);
          }
          // panel_b is above panel_a
          gap = ra.y - (rb.y + rb.h);
          if (0 <= gap && gap < max_gutter) {
            this._link_tb(panel_b, panel_a, rb, ra, gap);
          }
        }
      }
    }

    this._unify_skewline_mid_y();
    this._adjust_skewline_y_for_slanted_top();
  }

  private _adjust_skewline_y_for_slanted_top(): void {
    const _intersect = (hsl: SkewHLine, vsl: SkewLine): number | null => {
      const tan_h = Math.tan(radians(hsl.skew_angle));
      const tan_v = Math.tan(radians(vsl.skew_angle));
      const denom = 1 - tan_h * tan_v;
      if (Math.abs(denom) < 1e-9) return null;
      const xi =
        (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) / denom;
      const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
      return yi;
    };

    for (const p of this.panels) {
      const hsl_top = p.top.skewline;
      if (hsl_top !== null) {
        if (p.right.skewline && p.right.skewlineY) {
          const yi = _intersect(hsl_top, p.right.skewline);
          if (yi !== null) {
            const [, old_bot] = p.right.skewlineY;
            p.right.skewlineY = [yi, old_bot];
          }
        }
        if (p.left.skewline && p.left.skewlineY) {
          const yi = _intersect(hsl_top, p.left.skewline);
          if (yi !== null) {
            const [, old_bot] = p.left.skewlineY;
            p.left.skewlineY = [yi, old_bot];
          }
        }
      }

      const hsl_bot = p.bottom.skewline;
      if (hsl_bot !== null) {
        if (p.right.skewline && p.right.skewlineY) {
          const yi = _intersect(hsl_bot, p.right.skewline);
          if (yi !== null) {
            const [old_top] = p.right.skewlineY;
            p.right.skewlineY = [old_top, yi];
          }
        }
        if (p.left.skewline && p.left.skewlineY) {
          const yi = _intersect(hsl_bot, p.left.skewline);
          if (yi !== null) {
            const [old_top] = p.left.skewlineY;
            p.left.skewlineY = [old_top, yi];
          }
        }
      }
    }
  }

  private _unify_skewline_mid_y(): void {
    const right_groups = new Map<string, LayoutedPanel[]>();
    const left_groups = new Map<string, LayoutedPanel[]>();
    const keyOf = (base_x: number, angle: number): string => `${base_x}|${angle}`;

    for (const p of this.panels) {
      if (p.right.skewline) {
        const sl = p.right.skewline;
        const k = keyOf(sl.base_x, sl.skew_angle);
        if (!right_groups.has(k)) right_groups.set(k, []);
        right_groups.get(k)!.push(p);
      }
      if (p.left.skewline) {
        const sl = p.left.skewline;
        const k = keyOf(sl.base_x, sl.skew_angle);
        if (!left_groups.has(k)) left_groups.set(k, []);
        left_groups.get(k)!.push(p);
      }
    }

    for (const panels of right_groups.values()) {
      if (panels.length < 2) continue;
      panels.sort((a, b) => a.rect.y - b.rect.y);
      const canonical_mid_y = panels[0].right.skewline!.mid_y;
      for (const p of panels.slice(1)) {
        const sl = p.right.skewline!;
        p.right.skewline = new SkewLine(sl.base_x, canonical_mid_y, sl.skew_angle);
      }
    }

    for (const panels of left_groups.values()) {
      if (panels.length < 2) continue;
      panels.sort((a, b) => a.rect.y - b.rect.y);
      const canonical_mid_y = panels[0].left.skewline!.mid_y;
      for (const p of panels.slice(1)) {
        const sl = p.left.skewline!;
        p.left.skewline = new SkewLine(sl.base_x, canonical_mid_y, sl.skew_angle);
      }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private _link_lr(
    left: LayoutedPanel,
    right: LayoutedPanel,
    rl: Rect,
    rr: Rect,
    gap: number,
    overlap_top: number,
    overlap_bottom: number,
  ): void {
    left.right.adjacentSkew = right.attrs.skewLeft;
    right.left.adjacentSkew = left.attrs.skewRight;

    const skew_l = left.attrs.skewRight;
    const skew_r = right.attrs.skewLeft;
    // NOTE — intentional LR/TB asymmetry (do NOT "unify" without changing output):
    // The vertical (LR) shared gutter uses `effective_skew` below = "one side
    // wins" (the left panel's skewRight if nonzero, else the right's skewLeft).
    // The horizontal (TB) shared gutter (_link_tb) instead AVERAGES the two when
    // both are set: `(skew_t + skew_b) / 2`. This mirrors the original Python
    // implementation verbatim. `.private/SPEC.md` §5.4.3 documents the LR rule as
    // "average when both non-zero", i.e. the spec and the code disagree — but the
    // code (this file) is the source of truth for the golden references, so we
    // freeze the current behavior here. Setting both `skew_right` on the left and
    // `skew_left` on the right of one gutter is the only case where they differ;
    // pinned by test/unit/skewAsymmetry.test.ts.

    left.right.x = rl.x + rl.w; // left panel's own right boundary
    right.left.x = rr.x; // right panel's own left boundary

    const left_right_bw =
      left.attrs.borderRight !== null ? left.attrs.borderRight : left.attrs.border;
    const right_left_bw =
      right.attrs.borderLeft !== null ? right.attrs.borderLeft : right.attrs.border;
    const left_draws = left_right_bw > 0;
    const right_draws = right_left_bw > 0;

    const left_border_x = rl.x + rl.w; // left panel's right rect edge
    const right_border_x = rr.x; // right panel's left rect edge

    const effective_skew = skew_l !== 0 ? skew_l : skew_r;

    if (effective_skew !== 0) {
      if (left_draws) {
        const prev_sl = left.right.skewline;
        let ref_mid_y_left: number;
        if (
          prev_sl !== null &&
          prev_sl.base_x === left_border_x &&
          prev_sl.skew_angle === effective_skew
        ) {
          ref_mid_y_left = prev_sl.mid_y;
        } else {
          ref_mid_y_left = rl.h >= rr.h ? rl.y + rl.h / 2 : rr.y + rr.h / 2;
        }
        left.right.skewline = new SkewLine(left_border_x, ref_mid_y_left, effective_skew);
        const prev_y = left.right.skewlineY;
        left.right.skewlineY = [
          prev_y ? Math.min(prev_y[0], overlap_top) : overlap_top,
          prev_y ? Math.max(prev_y[1], overlap_bottom) : overlap_bottom,
        ];
      }
      if (right_draws) {
        const prev_sl = right.left.skewline;
        let ref_mid_y_right: number;
        if (
          prev_sl !== null &&
          prev_sl.base_x === right_border_x &&
          prev_sl.skew_angle === effective_skew
        ) {
          ref_mid_y_right = prev_sl.mid_y;
        } else {
          ref_mid_y_right = rl.h >= rr.h ? rl.y + rl.h / 2 : rr.y + rr.h / 2;
        }
        right.left.skewline = new SkewLine(right_border_x, ref_mid_y_right, effective_skew);
        const prev_y = right.left.skewlineY;
        let new_top = overlap_top;
        let new_bottom = overlap_bottom;
        if (prev_y) {
          new_top = Math.min(prev_y[0], overlap_top);
          new_bottom = Math.max(prev_y[1], overlap_bottom);
        } else if (rl.y < rr.y) {
          // left panel starts above this right panel — extend upward through
          // the gutter so the diagonal meets the horizontal border.
          new_top = Math.min(rr.y - gap, overlap_top);
        }
        right.left.skewlineY = [new_top, new_bottom];
      }
    }
  }

  private _link_tb(
    top: LayoutedPanel,
    bottom: LayoutedPanel,
    rt: Rect,
    rb: Rect,
    gap: number,
  ): void {
    top.bottom.adjacentSkew = bottom.attrs.skewTop;
    bottom.top.adjacentSkew = top.attrs.skewBottom;

    const skew_t = top.attrs.skewBottom;
    const skew_b = bottom.attrs.skewTop;
    // TB shared gutter AVERAGES both skews when set — deliberately different from
    // the LR "one wins" rule in _link_lr (see the note there). Frozen behavior.
    let shared_skew: number;
    if (skew_t !== 0 && skew_b !== 0) {
      shared_skew = (skew_t + skew_b) / 2;
    } else {
      shared_skew = skew_t + skew_b; // one is 0
    }

    const EPSILON2 = 0.01;
    const top_covers_bottom =
      rt.x <= rb.x + EPSILON2 && rt.x + rt.w >= rb.x + rb.w - EPSILON2;
    // For slanted gutters both borders lie on different parallel lines — both
    // must be drawn. Only suppress for flat gutters.
    if (top_covers_bottom && shared_skew === 0) {
      bottom.top.draw = false;
    }

    const shared_y = rt.y + rt.h + gap / 2;
    top.bottom.y = shared_y;
    bottom.top.y = shared_y;

    const offset = shared_skew !== 0 ? (rt.w / 2) * Math.tan(radians(shared_skew)) : 0;
    const left_x = rt.x;
    const right_x = rt.x + rt.w;

    if (shared_skew !== 0) {
      const mid_x = rt.x + rt.w / 2;
      top.bottom.skewline = new SkewHLine(rt.y + rt.h, mid_x, shared_skew);
      bottom.top.skewline = new SkewHLine(rb.y, mid_x, shared_skew);
    }

    top.bottom.endpoints = [left_x, rt.y + rt.h - offset, right_x, rt.y + rt.h + offset];
    const bot_left_x = rb.x;
    const bot_right_x = rb.x + rb.w;
    let bot_left_y: number;
    let bot_right_y: number;
    if (shared_skew !== 0) {
      const sl_bot = new SkewHLine(rb.y, rt.x + rt.w / 2, shared_skew);
      bot_left_y = sl_bot.y_at(bot_left_x);
      bot_right_y = sl_bot.y_at(bot_right_x);
    } else {
      bot_left_y = rb.y;
      bot_right_y = rb.y;
    }
    bottom.top.endpoints = [bot_left_x, bot_left_y, bot_right_x, bot_right_y];
  }

  // ── speech elements (balloon/monologue) ───────────────────────────────

  private _resolve_speech_elements(): void {
    for (const owner_panel of this.panels) {
      for (const node of owner_panel.speeches) {
        const attrs = node.attrs;
        const kind = node.kind;

        let width = attrs.width;
        let height = attrs.height;
        const aspect_ratio =
          node.kind === "balloon" ? (node.attrs as BalloonAttrs).aspectRatio : null;

        if (width !== null && height === null && aspect_ratio) {
          height = width * aspect_ratio;
        } else if (height !== null && width === null && aspect_ratio) {
          width = height / aspect_ratio;
        } else if (
          width !== null &&
          height === null &&
          attrs.textDirection === "horizontal"
        ) {
          // Explicit width, auto height: derive height from how many lines the
          // text actually wraps into at that width — otherwise the square-ish
          // estimate ignores the given width and produces a huge, mostly-empty
          // box.
          const pad2 = attrs.padding * 2;
          const content_w = Math.max(1, width - pad2);
          const max_w = attrs.wrap ? content_w : Number.POSITIVE_INFINITY;
          const nlines = countWrappedLines(
            plainText(attrs.text),
            max_w,
            attrs.fontSize,
            attrs.letterSpacing,
          );
          const line_h = resolveLineHeight(attrs.lineHeight, attrs.fontSize);
          height = nlines * line_h + pad2;
        } else if (width === null || height === null) {
          const [est_w, est_h] = _estimate_text_box_size(
            attrs.text,
            attrs.fontSize,
            attrs.textDirection,
            attrs.lineHeight,
            attrs.letterSpacing,
            attrs.wrap,
          );
          const pad2 = attrs.padding * 2;
          width = width !== null ? width : est_w + pad2;
          height = height !== null ? height : est_h + pad2;
        }

        const point_fn = _ANCHOR_POS_POINTS[attrs.anchorPos];
        let [base_x, base_y, gx, gy] = point_fn(owner_panel.rect);
        base_x += gx * attrs.margin;
        base_y += gy * attrs.margin;
        let x: number;
        let y: number;
        if (gx === -1) x = base_x - width!;
        else if (gx === 0) x = base_x - width! / 2;
        else x = base_x;
        if (gy === -1) y = base_y - height!;
        else if (gy === 0) y = base_y - height! / 2;
        else y = base_y;

        if (attrs.x !== null) {
          x = attrs.x;
          if (attrs.margin) {
            const panel = owner_panel.rect;
            const box_cx = x + width! / 2;
            const dx = panel.x + panel.w / 2 - box_cx;
            if (Math.abs(dx) > 1e-6) {
              x += Math.sign(dx) * Math.min(attrs.margin, Math.abs(dx));
            }
          }
        }
        if (attrs.y !== null) {
          y = attrs.y;
          if (attrs.margin) {
            const panel = owner_panel.rect;
            const box_cy = y + height! / 2;
            const dy = panel.y + panel.h / 2 - box_cy;
            if (Math.abs(dy) > 1e-6) {
              y += Math.sign(dy) * Math.min(attrs.margin, Math.abs(dy));
            }
          }
        }

        x += attrs.dx;
        y += attrs.dy;

        const rect = new Rect(x, y, width!, height!);

        this.speeches.push(
          new LayoutedSpeech(kind, node.id, rect, attrs, kind === "balloon"),
        );
      }
    }
  }
}
