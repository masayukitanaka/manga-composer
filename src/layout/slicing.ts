/**
 * Recursive space-partitioning layout engine.
 *
 * Port of manga-gen-python/src/manga_gen/layout/slicing.py.
 *
 * Ported LITERALLY, preserving Python method/variable names and branch order
 * (docs/PORTING_GUIDE.md §4 Stage 5): the shared-border / skew geometry is
 * bug-fragile and any "cleanup" risks changing float rounding or branch order
 * in ways that surface as a subtly-misplaced corner in one example.
 */

import {
  type Page,
  type LayoutNode,
  type RowNode,
  type ColNode,
  type Length,
  type PanelAttrs,
  type SpeechNode,
  type BalloonAttrs,
  type MonologueAttrs,
} from "../ast.js";
import { LayoutError } from "../errors.js";

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

/** A panel with computed layout (absolute coordinates). */
export class LayoutedPanel {
  id: string;
  rect: Rect;
  attrs: PanelAttrs;
  draw_left = true;
  draw_right = true;
  draw_top = true;
  draw_bottom = true;
  // Skew values from adjacent panels for shared borders
  adjacent_left_skew = 0.0;
  adjacent_right_skew = 0.0;
  adjacent_top_skew = 0.0;
  adjacent_bottom_skew = 0.0;
  // Position of shared borders (middle of gutter) — used for polygon base
  shared_left_x: number | null = null;
  shared_right_x: number | null = null;
  shared_top_y: number | null = null;
  shared_bottom_y: number | null = null;
  // Skew line descriptors for vertical shared borders.
  shared_left_skewline: SkewLine | null = null;
  shared_right_skewline: SkewLine | null = null;
  // Y range over which the left/right skewline is valid (panel overlap span).
  shared_left_skewline_y: [number, number] | null = null;
  shared_right_skewline_y: [number, number] | null = null;
  // Skew line descriptors for horizontal shared borders (top/bottom).
  shared_top_skewline: SkewHLine | null = null;
  shared_bottom_skewline: SkewHLine | null = null;
  // Endpoint tuples for horizontal shared borders: (left_x, left_y, right_x, right_y)
  shared_top_endpoints: [number, number, number, number] | null = null;
  shared_bottom_endpoints: [number, number, number, number] | null = null;
  // balloon/monologue nested inside this panel (AST nodes)
  speeches: SpeechNode[] = [];
  // Set by _link_tb; consumed by _adjust_skewline_y_for_slanted_top.
  _top_border_skewline?: SkewHLine;

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

const _DEFAULT_SPEECH_W = 30.0;
const _DEFAULT_SPEECH_H = 15.0;

// Shared sizing constants — MUST match renderer/svg.ts's _draw_text_block.
export const TEXT_CHAR_W_FACTOR = 1.0;
export const TEXT_LINE_H_FACTOR = 1.4;

/** Rough width/height estimate (mm) for a text block. */
export function _estimate_text_box_size(
  text: string,
  font_size: number,
  direction: string,
): [number, number] {
  if (!text) {
    return [_DEFAULT_SPEECH_W, _DEFAULT_SPEECH_H];
  }

  const MARGIN = 1.6;
  const ASPECT = 1.8; // target height / width ratio for vertical text
  const char_w = font_size * TEXT_CHAR_W_FACTOR;
  const line_h = font_size * TEXT_LINE_H_FACTOR;
  const n = text.length;

  let w: number;
  let h: number;
  if (direction === "vertical") {
    const chars_per_col = Math.max(1, Math.round(Math.sqrt((ASPECT * n * line_h) / char_w)));
    const cols = Math.max(1, Math.ceil(n / chars_per_col));
    w = line_h * cols * MARGIN;
    h = char_w * Math.min(n, chars_per_col) * MARGIN;
  } else {
    const chars_per_line = Math.max(1, Math.round(Math.sqrt((n * line_h) / char_w)));
    const lines = Math.max(1, Math.ceil(n / chars_per_line));
    w = char_w * Math.min(n, chars_per_line) * MARGIN;
    h = line_h * lines * MARGIN;
  }
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
      const hsl_top = p.shared_top_skewline;
      if (hsl_top !== null) {
        if (p.shared_right_skewline && p.shared_right_skewline_y) {
          const yi = _intersect(hsl_top, p.shared_right_skewline);
          if (yi !== null) {
            const [, old_bot] = p.shared_right_skewline_y;
            p.shared_right_skewline_y = [yi, old_bot];
          }
        }
        if (p.shared_left_skewline && p.shared_left_skewline_y) {
          const yi = _intersect(hsl_top, p.shared_left_skewline);
          if (yi !== null) {
            const [, old_bot] = p.shared_left_skewline_y;
            p.shared_left_skewline_y = [yi, old_bot];
          }
        }
      }

      const hsl_bot = p.shared_bottom_skewline;
      if (hsl_bot !== null) {
        if (p.shared_right_skewline && p.shared_right_skewline_y) {
          const yi = _intersect(hsl_bot, p.shared_right_skewline);
          if (yi !== null) {
            const [old_top] = p.shared_right_skewline_y;
            p.shared_right_skewline_y = [old_top, yi];
          }
        }
        if (p.shared_left_skewline && p.shared_left_skewline_y) {
          const yi = _intersect(hsl_bot, p.shared_left_skewline);
          if (yi !== null) {
            const [old_top] = p.shared_left_skewline_y;
            p.shared_left_skewline_y = [old_top, yi];
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
      if (p.shared_right_skewline) {
        const sl = p.shared_right_skewline;
        const k = keyOf(sl.base_x, sl.skew_angle);
        if (!right_groups.has(k)) right_groups.set(k, []);
        right_groups.get(k)!.push(p);
      }
      if (p.shared_left_skewline) {
        const sl = p.shared_left_skewline;
        const k = keyOf(sl.base_x, sl.skew_angle);
        if (!left_groups.has(k)) left_groups.set(k, []);
        left_groups.get(k)!.push(p);
      }
    }

    for (const panels of right_groups.values()) {
      if (panels.length < 2) continue;
      panels.sort((a, b) => a.rect.y - b.rect.y);
      const canonical_mid_y = panels[0].shared_right_skewline!.mid_y;
      for (const p of panels.slice(1)) {
        const sl = p.shared_right_skewline!;
        p.shared_right_skewline = new SkewLine(sl.base_x, canonical_mid_y, sl.skew_angle);
      }
    }

    for (const panels of left_groups.values()) {
      if (panels.length < 2) continue;
      panels.sort((a, b) => a.rect.y - b.rect.y);
      const canonical_mid_y = panels[0].shared_left_skewline!.mid_y;
      for (const p of panels.slice(1)) {
        const sl = p.shared_left_skewline!;
        p.shared_left_skewline = new SkewLine(sl.base_x, canonical_mid_y, sl.skew_angle);
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
    left.adjacent_right_skew = right.attrs.skewLeft;
    right.adjacent_left_skew = left.attrs.skewRight;

    const skew_l = left.attrs.skewRight;
    const skew_r = right.attrs.skewLeft;
    // (shared_skew is computed in Python but only effective_skew is used here.)

    left.shared_right_x = rl.x + rl.w; // left panel's own right boundary
    right.shared_left_x = rr.x; // right panel's own left boundary

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
        const prev_sl = left.shared_right_skewline;
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
        left.shared_right_skewline = new SkewLine(left_border_x, ref_mid_y_left, effective_skew);
        const prev_y = left.shared_right_skewline_y;
        left.shared_right_skewline_y = [
          prev_y ? Math.min(prev_y[0], overlap_top) : overlap_top,
          prev_y ? Math.max(prev_y[1], overlap_bottom) : overlap_bottom,
        ];
      }
      if (right_draws) {
        const prev_sl = right.shared_left_skewline;
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
        right.shared_left_skewline = new SkewLine(right_border_x, ref_mid_y_right, effective_skew);
        const prev_y = right.shared_left_skewline_y;
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
        right.shared_left_skewline_y = [new_top, new_bottom];
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
    top.adjacent_bottom_skew = bottom.attrs.skewTop;
    bottom.adjacent_top_skew = top.attrs.skewBottom;

    const skew_t = top.attrs.skewBottom;
    const skew_b = bottom.attrs.skewTop;
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
      bottom.draw_top = false;
    }

    const shared_y = rt.y + rt.h + gap / 2;
    top.shared_bottom_y = shared_y;
    bottom.shared_top_y = shared_y;

    const offset = shared_skew !== 0 ? (rt.w / 2) * Math.tan(radians(shared_skew)) : 0;
    const left_x = rt.x;
    const right_x = rt.x + rt.w;

    if (shared_skew !== 0) {
      const mid_x = rt.x + rt.w / 2;
      top.shared_bottom_skewline = new SkewHLine(rt.y + rt.h, mid_x, shared_skew);
      bottom.shared_top_skewline = new SkewHLine(rb.y, mid_x, shared_skew);
      bottom._top_border_skewline = new SkewHLine(rt.y + rt.h, mid_x, shared_skew);
    }

    top.shared_bottom_endpoints = [left_x, rt.y + rt.h - offset, right_x, rt.y + rt.h + offset];
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
    bottom.shared_top_endpoints = [bot_left_x, bot_left_y, bot_right_x, bot_right_y];
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
        } else if (width === null || height === null) {
          const [est_w, est_h] = _estimate_text_box_size(
            attrs.text,
            attrs.fontSize,
            attrs.textDirection,
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
