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

import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import type { Page } from "../ast.js";
import { Rect, LayoutedPanel, LayoutedSpeech } from "../layout/slicing.js";
import { XmlElement } from "./xml.js";
import { renderBalloon } from "./balloonOutline.js";

const radians = (deg: number): number => (deg * Math.PI) / 180;

// Number → string. Plain String(); the harness handles the 20.0-vs-20 gap.
const s = (n: number): string => String(n);

type Point = [number, number];

// ── module-level polygon/line clipping helpers ──────────────────────────────

function _clip_polygon_to_rect(
  pts: Point[],
  x_min: number,
  y_min: number,
  x_max: number,
  y_max: number,
): Point[] {
  const _intersect = (p1: Point, p2: Point, a: Point, b: Point): Point => {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const [x3, y3] = a;
    const [x4, y4] = b;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-12) return [(x1 + x2) / 2, (y1 + y2) / 2];
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };

  const _clip_edge = (
    poly: Point[],
    a: Point,
    b: Point,
    inside: (p: Point) => boolean,
  ): Point[] => {
    if (poly.length === 0) return [];
    const out: Point[] = [];
    let prev = poly[poly.length - 1];
    for (const cur of poly) {
      if (inside(cur)) {
        if (!inside(prev)) out.push(_intersect(prev, cur, a, b));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(_intersect(prev, cur, a, b));
      }
      prev = cur;
    }
    return out;
  };

  let poly: Point[] = [...pts];
  poly = _clip_edge(poly, [x_min, y_min], [x_min, y_max], (p) => p[0] >= x_min);
  poly = _clip_edge(poly, [x_max, y_min], [x_max, y_max], (p) => p[0] <= x_max);
  poly = _clip_edge(poly, [x_min, y_min], [x_max, y_min], (p) => p[1] >= y_min);
  poly = _clip_edge(poly, [x_min, y_max], [x_max, y_max], (p) => p[1] <= y_max);
  return poly;
}

function _panel_fill_polygon(
  tl_x: number,
  tl_y: number,
  tr_x: number,
  tr_y: number,
  br_x: number,
  br_y: number,
  bl_x: number,
  bl_y: number,
  x_min: number,
  y_min: number,
  x_max: number,
  y_max: number,
): Point[] {
  const quad: Point[] = [
    [tl_x, tl_y],
    [tr_x, tr_y],
    [br_x, br_y],
    [bl_x, bl_y],
  ];
  return _clip_polygon_to_rect(quad, x_min, y_min, x_max, y_max);
}

const SPEECH_DEFAULT_Z = 100;

export class SVGRenderer {
  page: Page;
  panels: LayoutedPanel[];
  speeches: LayoutedSpeech[];
  source_dir: string;

  constructor(
    page: Page,
    panels: LayoutedPanel[],
    speeches: LayoutedSpeech[] | null = null,
    source_dir: string | null = null,
  ) {
    this.page = page;
    this.panels = panels;
    this.speeches = speeches ?? [];
    this.source_dir = source_dir ?? process.cwd();
  }

  render(): string {
    const cfg = this.page.config;

    let svg: XmlElement;
    if (cfg.sizeUnit === "px") {
      const MM_PER_INCH = 25.4;
      const PX_PER_INCH = 96.0;
      const w_px = Math.round(cfg.widthMm / (MM_PER_INCH / PX_PER_INCH));
      const h_px = Math.round(cfg.heightMm / (MM_PER_INCH / PX_PER_INCH));
      svg = new XmlElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
        width: s(w_px),
        height: s(h_px),
        viewBox: `0 0 ${cfg.widthMm} ${cfg.heightMm}`,
      });
    } else {
      svg = new XmlElement("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
        width: `${cfg.widthMm}mm`,
        height: `${cfg.heightMm}mm`,
        viewBox: `0 0 ${cfg.widthMm} ${cfg.heightMm}`,
      });
    }

    // Page background: gutter_color fills the whole page.
    svg.sub("rect", {
      x: "0",
      y: "0",
      width: s(cfg.widthMm),
      height: s(cfg.heightMm),
      fill: cfg.gutterColor,
    });

    const defs = svg.sub("defs");

    const effective_z = (item: LayoutedPanel | LayoutedSpeech): number => {
      if (item instanceof LayoutedSpeech) {
        return item.attrs.zIndex !== null ? item.attrs.zIndex : SPEECH_DEFAULT_Z;
      }
      if (item.attrs.zIndex !== null) return item.attrs.zIndex;
      return { 1: 1, 2: 0, 3: -1 }[item.attrs.importance];
    };

    // Speeches appended after panels so that, within an equal z level, they
    // stack on top of panels (stable sort preserves document order).
    const all_items: (LayoutedPanel | LayoutedSpeech)[] = [...this.panels, ...this.speeches];
    // Stable sort (V8 Array.sort is stable) — same as Python's sorted().
    const ordered = [...all_items].sort((a, b) => effective_z(a) - effective_z(b));

    // groupby over consecutive equal effective_z.
    let idx = 0;
    while (idx < ordered.length) {
      const z = effective_z(ordered[idx]);
      const group: (LayoutedPanel | LayoutedSpeech)[] = [];
      while (idx < ordered.length && effective_z(ordered[idx]) === z) {
        group.push(ordered[idx]);
        idx++;
      }
      const bg_group = svg.sub("g", { id: `backgrounds_z${z}` });
      const border_group = svg.sub("g", { id: `borders_z${z}` });
      for (const item of group) {
        if (item instanceof LayoutedSpeech) {
          this._render_speech(bg_group, border_group, item, defs);
        } else {
          this._render_panel(bg_group, border_group, item, defs);
        }
      }
    }

    return svg.serialize();
  }

  private _render_panel(
    bg_parent: XmlElement,
    border_parent: XmlElement,
    panel: LayoutedPanel,
    defs: XmlElement | null = null,
  ): void {
    let r = panel.rect;
    const attrs = panel.attrs;

    // Apply offset to panel rect (dynamic overlapping).
    const offset_rect = new Rect(
      r.x - attrs.offsetLeft,
      r.y - attrs.offsetTop,
      r.w + attrs.offsetLeft + attrs.offsetRight,
      r.h + attrs.offsetTop + attrs.offsetBottom,
    );
    r = offset_rect;

    // Offsets move an edge away from the shared boundary computed at layout
    // time; drop stale shared-border data for a moved edge.
    if (attrs.offsetTop !== 0) {
      panel.draw_top = true;
      panel.shared_top_endpoints = null;
      panel.shared_top_skewline = null;
      panel.shared_top_y = null;
    }
    if (attrs.offsetBottom !== 0) {
      panel.draw_bottom = true;
      panel.shared_bottom_endpoints = null;
      panel.shared_bottom_skewline = null;
      panel.shared_bottom_y = null;
    }
    if (attrs.offsetLeft !== 0) {
      panel.draw_left = true;
      panel.shared_left_skewline = null;
      panel.shared_left_skewline_y = null;
      panel.shared_left_x = null;
    }
    if (attrs.offsetRight !== 0) {
      panel.draw_right = true;
      panel.shared_right_skewline = null;
      panel.shared_right_skewline_y = null;
      panel.shared_right_x = null;
    }

    const g = bg_parent.sub("g", { id: panel.id });
    const gb = border_parent.sub("g", { id: `${panel.id}_borders` });

    const has_skew =
      attrs.skewLeft !== 0 ||
      attrs.skewRight !== 0 ||
      attrs.skewTop !== 0 ||
      attrs.skewBottom !== 0 ||
      panel.adjacent_left_skew !== 0 ||
      panel.adjacent_right_skew !== 0 ||
      panel.adjacent_top_skew !== 0 ||
      panel.adjacent_bottom_skew !== 0;

    if (has_skew) {
      this._render_skewed_panel(g, gb, border_parent, panel, r, defs);
    } else {
      this._render_rect_panel(g, gb, panel, r);
    }

    if (attrs.image) this._render_image(g, panel);
    if (attrs.text) this._render_text(g, panel);

    if (attrs.label !== null) {
      const t = g.sub("text", {
        x: s(r.x + r.w / 2),
        y: s(r.y + r.h / 2),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "4",
        "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
        fill: "#999999",
      });
      t.setText(attrs.label ? attrs.label : panel.id);
    }
  }

  private _render_rect_panel(
    g: XmlElement,
    gb: XmlElement,
    panel: LayoutedPanel,
    r: Rect,
  ): void {
    const attrs = panel.attrs;
    const has_individual_borders =
      attrs.borderTop !== null ||
      attrs.borderBottom !== null ||
      attrs.borderLeft !== null ||
      attrs.borderRight !== null;

    if (has_individual_borders) {
      g.sub("rect", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        fill: attrs.background,
        stroke: "none",
      });

      const border_left_width = attrs.borderLeft !== null ? attrs.borderLeft : attrs.border;
      const border_right_width = attrs.borderRight !== null ? attrs.borderRight : attrs.border;
      const border_top_width = attrs.borderTop !== null ? attrs.borderTop : attrs.border;
      const border_bottom_width =
        attrs.borderBottom !== null ? attrs.borderBottom : attrs.border;

      if (border_left_width > 0) {
        gb.sub("line", {
          x1: s(r.x),
          y1: s(r.y),
          x2: s(r.x),
          y2: s(r.y + r.h),
          stroke: attrs.borderColor,
          "stroke-width": s(border_left_width),
        });
      }
      if (border_right_width > 0) {
        gb.sub("line", {
          x1: s(r.x + r.w),
          y1: s(r.y),
          x2: s(r.x + r.w),
          y2: s(r.y + r.h),
          stroke: attrs.borderColor,
          "stroke-width": s(border_right_width),
        });
      }
      if (border_top_width > 0) {
        gb.sub("line", {
          x1: s(r.x),
          y1: s(r.y),
          x2: s(r.x + r.w),
          y2: s(r.y),
          stroke: attrs.borderColor,
          "stroke-width": s(border_top_width),
        });
      }
      if (border_bottom_width > 0) {
        gb.sub("line", {
          x1: s(r.x),
          y1: s(r.y + r.h),
          x2: s(r.x + r.w),
          y2: s(r.y + r.h),
          stroke: attrs.borderColor,
          "stroke-width": s(border_bottom_width),
        });
      }
    } else {
      g.sub("rect", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        fill: attrs.background,
        stroke: "none",
      });
      if (attrs.border > 0) {
        gb.sub("rect", {
          x: s(r.x),
          y: s(r.y),
          width: s(r.w),
          height: s(r.h),
          fill: "none",
          stroke: attrs.borderColor,
          "stroke-width": s(attrs.border),
        });
      }
    }
  }

  private _render_skewed_panel(
    g: XmlElement,
    gb: XmlElement,
    border_parent: XmlElement,
    panel: LayoutedPanel,
    r: Rect,
    defs: XmlElement | null,
  ): void {
    const attrs = panel.attrs;

    const _eff = (own: number, adj: number): number => {
      if (own !== 0 && adj !== 0) return (own + adj) / 2;
      return own + adj;
    };

    // left_skew/right_skew/top_skew/bottom_skew computed for parity with
    // Python; only own skews feed the polygon-corner offsets below.
    void _eff(attrs.skewLeft, panel.adjacent_left_skew);
    void _eff(attrs.skewRight, panel.adjacent_right_skew);
    const top_skew = _eff(attrs.skewTop, panel.adjacent_top_skew);
    const bottom_skew = _eff(attrs.skewBottom, panel.adjacent_bottom_skew);

    const left_base_x = panel.shared_left_x !== null ? panel.shared_left_x : r.x;
    const right_base_x = panel.shared_right_x !== null ? panel.shared_right_x : r.x + r.w;
    // (top_edge_y/bottom_edge_y are computed in Python but unused there.)

    const top_offset_y = top_skew !== 0 ? (r.w / 2) * Math.tan(radians(top_skew)) : 0;
    const bottom_offset_y =
      bottom_skew !== 0 ? (r.w / 2) * Math.tan(radians(bottom_skew)) : 0;
    const own_left_offset =
      attrs.skewLeft !== 0 ? (r.h / 2) * Math.tan(radians(attrs.skewLeft)) : 0;
    const own_right_offset =
      attrs.skewRight !== 0 ? (r.h / 2) * Math.tan(radians(attrs.skewRight)) : 0;

    // ── Polygon corners ──────────────────────────────────────────────────
    let tl_x: number;
    let bl_x: number;
    if (panel.shared_left_skewline) {
      tl_x = panel.shared_left_skewline.x_at(r.y);
      bl_x = panel.shared_left_skewline.x_at(r.y + r.h);
    } else if (panel.shared_left_x !== null) {
      tl_x = bl_x = left_base_x;
    } else {
      tl_x = left_base_x - own_left_offset;
      bl_x = left_base_x + own_left_offset;
    }

    let tr_x: number;
    let br_x: number;
    if (panel.shared_right_skewline) {
      tr_x = panel.shared_right_skewline.x_at(r.y);
      br_x = panel.shared_right_skewline.x_at(r.y + r.h);
    } else if (panel.shared_right_x !== null) {
      tr_x = br_x = right_base_x;
    } else {
      tr_x = right_base_x + own_right_offset;
      br_x = right_base_x - own_right_offset;
    }

    let tl_y: number;
    let tr_y: number;
    if (panel.shared_top_skewline) {
      if (panel.shared_top_endpoints) {
        const [_ep_tx1, _ep_ty1, , ] = panel.shared_top_endpoints;
        const _tan = Math.tan(radians(panel.shared_top_skewline.skew_angle));
        const _mid_x = panel.shared_top_skewline.mid_x;
        const _base_y_corrected = _ep_ty1 - (_ep_tx1 - _mid_x) * _tan;
        tl_y = _base_y_corrected + (tl_x - _mid_x) * _tan;
        tr_y = _base_y_corrected + (tr_x - _mid_x) * _tan;
      } else {
        tl_y = panel.shared_top_skewline.y_at(tl_x);
        tr_y = panel.shared_top_skewline.y_at(tr_x);
      }
    } else {
      tl_y = r.y - top_offset_y;
      tr_y = r.y + top_offset_y;
    }

    let bl_y: number;
    let br_y: number;
    if (panel.shared_bottom_skewline) {
      bl_y = panel.shared_bottom_skewline.y_at(bl_x);
      br_y = panel.shared_bottom_skewline.y_at(br_x);
    } else {
      br_y = r.y + r.h + bottom_offset_y;
      bl_y = r.y + r.h - bottom_offset_y;
    }

    // ── Background: fill the clipped panel trapezoid ─────────────────────
    const clip_y_min = panel.shared_top_skewline ? Math.min(tl_y, tr_y) : r.y;
    const clip_y_max = panel.shared_bottom_skewline ? Math.max(bl_y, br_y) : r.y + r.h;
    const clip_x_min =
      panel.shared_left_skewline || attrs.skewLeft !== 0 ? Math.min(tl_x, bl_x) : r.x;
    const clip_x_max =
      panel.shared_right_skewline || attrs.skewRight !== 0 ? Math.max(tr_x, br_x) : r.x + r.w;
    const poly_pts = _panel_fill_polygon(
      tl_x,
      tl_y,
      tr_x,
      tr_y,
      br_x,
      br_y,
      bl_x,
      bl_y,
      clip_x_min,
      clip_y_min,
      clip_x_max,
      clip_y_max,
    );
    if (poly_pts.length > 0) {
      const points_str = poly_pts.map(([x, y]) => `${x},${y}`).join(" ");
      g.sub("polygon", { points: points_str, fill: attrs.background, stroke: "none" });
    }

    // ── Border lines ─────────────────────────────────────────────────────
    const border_left_width = attrs.borderLeft !== null ? attrs.borderLeft : attrs.border;
    const border_right_width = attrs.borderRight !== null ? attrs.borderRight : attrs.border;
    const border_top_width = attrs.borderTop !== null ? attrs.borderTop : attrs.border;
    const border_bottom_width = attrs.borderBottom !== null ? attrs.borderBottom : attrs.border;

    if (defs !== null) {
      const clip_id = `clip_${panel.id}`;
      const cp = defs.sub("clipPath", { id: clip_id });
      const clip_rect_y = clip_y_min;
      const clip_rect_h = clip_y_max - clip_rect_y;
      let clip_rect_x = r.x;
      let clip_rect_x2 = r.x + r.w;
      if (panel.shared_left_skewline && panel.shared_left_skewline_y) {
        const [y_top, y_bot] = panel.shared_left_skewline_y;
        clip_rect_x = Math.min(
          clip_rect_x,
          panel.shared_left_skewline.x_at(y_top),
          panel.shared_left_skewline.x_at(y_bot),
        );
      }
      if (panel.shared_right_skewline && panel.shared_right_skewline_y) {
        const [y_top, y_bot] = panel.shared_right_skewline_y;
        clip_rect_x2 = Math.max(
          clip_rect_x2,
          panel.shared_right_skewline.x_at(y_top),
          panel.shared_right_skewline.x_at(y_bot),
        );
      }
      cp.sub("rect", {
        x: s(clip_rect_x),
        y: s(clip_rect_y),
        width: s(clip_rect_x2 - clip_rect_x),
        height: s(clip_rect_h),
      });
      gb.set("clip-path", `url(#${clip_id})`);
    }

    const _line = (
      parent: XmlElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width: number,
    ): void => {
      parent.sub("line", {
        x1: s(x1),
        y1: s(y1),
        x2: s(x2),
        y2: s(y2),
        stroke: attrs.borderColor,
        "stroke-width": s(width),
      });
    };

    // Vertical border Y extents.
    let left_top_y: number;
    let right_top_y: number;
    if (panel.shared_top_endpoints) {
      const [, _ty1, , _ty2] = panel.shared_top_endpoints;
      if (panel.shared_left_skewline) left_top_y = r.y;
      else if (panel.shared_top_skewline) left_top_y = _ty1;
      else left_top_y = r.y;
      if (panel.shared_right_skewline) right_top_y = r.y;
      else if (panel.shared_top_skewline) right_top_y = _ty2;
      else right_top_y = r.y;
    } else {
      left_top_y = right_top_y = r.y;
    }

    let left_bottom_y: number;
    let right_bottom_y: number;
    if (panel.shared_bottom_endpoints) {
      if (panel.shared_left_skewline) left_bottom_y = r.y + r.h;
      else if (panel.shared_bottom_skewline)
        left_bottom_y = panel.shared_bottom_skewline.y_at(r.x);
      else left_bottom_y = r.y + r.h;
      if (panel.shared_right_skewline) right_bottom_y = r.y + r.h;
      else if (panel.shared_bottom_skewline)
        right_bottom_y = panel.shared_bottom_skewline.y_at(r.x + r.w);
      else right_bottom_y = r.y + r.h;
    } else {
      left_bottom_y = right_bottom_y = r.y + r.h;
    }

    // Left border.
    if (panel.draw_left && border_left_width > 0) {
      if (panel.shared_left_skewline) {
        const sl = panel.shared_left_skewline;
        let [y1, y2] = panel.shared_left_skewline_y
          ? panel.shared_left_skewline_y
          : [r.y, r.y + r.h];
        if (!panel.shared_top_skewline) y1 = r.y;
        if (!panel.shared_bottom_skewline) y2 = r.y + r.h;
        const x1_sl = sl.x_at(y1);
        const x2_sl = sl.x_at(y2);
        _line(border_parent, x1_sl, y1, x2_sl, y2, border_left_width);
      } else if (attrs.skewLeft !== 0) {
        _line(border_parent, tl_x, tl_y, bl_x, bl_y, border_left_width);
      } else {
        _line(border_parent, r.x, left_top_y, r.x, left_bottom_y, border_left_width);
      }
    }

    // Right border.
    if (panel.draw_right && border_right_width > 0) {
      if (panel.shared_right_skewline) {
        const sl = panel.shared_right_skewline;
        let [y1, y2] = panel.shared_right_skewline_y
          ? panel.shared_right_skewline_y
          : [r.y, r.y + r.h];
        if (!panel.shared_top_skewline) y1 = r.y;
        if (!panel.shared_bottom_skewline) y2 = r.y + r.h;
        const x1_sl = sl.x_at(y1);
        const x2_sl = sl.x_at(y2);
        _line(border_parent, x1_sl, y1, x2_sl, y2, border_right_width);
      } else if (attrs.skewRight !== 0) {
        _line(border_parent, tr_x, tr_y, br_x, br_y, border_right_width);
      } else {
        _line(border_parent, r.x + r.w, right_top_y, r.x + r.w, right_bottom_y, border_right_width);
      }
    }

    // Top border.
    const needs_top =
      panel.draw_top ||
      (border_top_width > 0 &&
        (panel.shared_left_skewline !== null || panel.shared_right_skewline !== null) &&
        panel.shared_top_endpoints !== null &&
        panel.shared_top_skewline === null);
    if (needs_top && border_top_width > 0) {
      let tx1: number;
      let ty1: number;
      let tx2: number;
      let ty2: number;
      if (panel.shared_top_endpoints) {
        [tx1, ty1, tx2, ty2] = panel.shared_top_endpoints;
      } else {
        [tx1, ty1, tx2, ty2] = [tl_x, tl_y, tr_x, tr_y];
      }
      if (!panel.shared_top_skewline) {
        if (panel.shared_left_skewline) {
          tx1 = panel.shared_left_skewline.x_at(r.y);
          ty1 = r.y;
        } else if (attrs.skewLeft !== 0) {
          [tx1, ty1] = [tl_x, tl_y];
        }
        if (panel.shared_right_skewline) {
          tx2 = panel.shared_right_skewline.x_at(r.y);
          ty2 = r.y;
        } else if (attrs.skewRight !== 0) {
          [tx2, ty2] = [tr_x, tr_y];
        }
      } else {
        const hsl = panel.shared_top_skewline;
        if (panel.shared_right_skewline) {
          const vsl = panel.shared_right_skewline;
          const tan_h = Math.tan(radians(hsl.skew_angle));
          const tan_v = Math.tan(radians(vsl.skew_angle));
          const denom = 1 - tan_h * tan_v;
          if (Math.abs(denom) > 1e-9) {
            const xi =
              (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) /
              denom;
            const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
            [tx2, ty2] = [xi, yi];
          }
        }
        if (panel.shared_left_skewline) {
          const vsl = panel.shared_left_skewline;
          const tan_h = Math.tan(radians(hsl.skew_angle));
          const tan_v = Math.tan(radians(vsl.skew_angle));
          const denom = 1 - tan_h * tan_v;
          if (Math.abs(denom) > 1e-9) {
            const xi =
              (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) /
              denom;
            const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
            [tx1, ty1] = [xi, yi];
          }
        }
      }
      _line(border_parent, tx1, ty1, tx2, ty2, border_top_width);
    }

    // Bottom border.
    if (panel.draw_bottom && border_bottom_width > 0) {
      let bx1: number;
      let by1: number;
      let bx2: number;
      let by2: number;
      if (panel.shared_bottom_endpoints) {
        [bx1, by1, bx2, by2] = panel.shared_bottom_endpoints;
      } else {
        [bx1, by1, bx2, by2] = [bl_x, bl_y, br_x, br_y];
      }
      if (panel.shared_left_skewline && !panel.shared_bottom_skewline) {
        let sl_y_end = panel.shared_left_skewline_y ? panel.shared_left_skewline_y[1] : by1;
        sl_y_end = Math.max(sl_y_end, r.y + r.h);
        const by1_clamped = Math.max(Math.min(by1, sl_y_end), r.y + r.h);
        bx1 = panel.shared_left_skewline.x_at(by1_clamped);
        by1 = by1_clamped;
      } else if (
        panel.shared_left_skewline &&
        !panel.shared_bottom_endpoints &&
        panel.shared_bottom_skewline
      ) {
        const vsl = panel.shared_left_skewline;
        const hsl = panel.shared_bottom_skewline;
        const tan_h = Math.tan(radians(hsl.skew_angle));
        const tan_v = Math.tan(radians(vsl.skew_angle));
        const denom = 1 - tan_h * tan_v;
        if (Math.abs(denom) > 1e-9) {
          const xi =
            (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) / denom;
          const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
          [bx1, by1] = [xi, yi];
        }
      } else if (attrs.skewLeft !== 0 && !panel.shared_bottom_skewline) {
        [bx1, by1] = [bl_x, bl_y];
      } else {
        if (panel.shared_bottom_endpoints) {
          // by1 already correct
        } else {
          by1 = r.y + r.h;
        }
      }
      if (panel.shared_right_skewline && !panel.shared_bottom_skewline) {
        let sl_y_end = panel.shared_right_skewline_y ? panel.shared_right_skewline_y[1] : by2;
        sl_y_end = Math.max(sl_y_end, r.y + r.h);
        const by2_clamped = Math.max(Math.min(by2, sl_y_end), r.y + r.h);
        bx2 = panel.shared_right_skewline.x_at(by2_clamped);
        by2 = by2_clamped;
      } else if (
        panel.shared_right_skewline &&
        !panel.shared_bottom_endpoints &&
        panel.shared_bottom_skewline
      ) {
        const vsl = panel.shared_right_skewline;
        const hsl = panel.shared_bottom_skewline;
        const tan_h = Math.tan(radians(hsl.skew_angle));
        const tan_v = Math.tan(radians(vsl.skew_angle));
        const denom = 1 - tan_h * tan_v;
        if (Math.abs(denom) > 1e-9) {
          const xi =
            (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) / denom;
          const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
          [bx2, by2] = [xi, yi];
        }
      } else if (attrs.skewRight !== 0 && !panel.shared_bottom_skewline) {
        [bx2, by2] = [br_x, br_y];
      } else {
        if (panel.shared_bottom_endpoints) {
          // by2 already correct
        } else {
          by2 = r.y + r.h;
        }
      }
      if (panel.shared_bottom_skewline) {
        const hsl = panel.shared_bottom_skewline;
        if (panel.shared_right_skewline) {
          const vsl = panel.shared_right_skewline;
          const tan_h = Math.tan(radians(hsl.skew_angle));
          const tan_v = Math.tan(radians(vsl.skew_angle));
          const denom = 1 - tan_h * tan_v;
          if (Math.abs(denom) > 1e-9) {
            const xi =
              (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) /
              denom;
            const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
            [bx2, by2] = [xi, yi];
          }
        }
        if (panel.shared_left_skewline) {
          const vsl = panel.shared_left_skewline;
          const tan_h = Math.tan(radians(hsl.skew_angle));
          const tan_v = Math.tan(radians(vsl.skew_angle));
          const denom = 1 - tan_h * tan_v;
          if (Math.abs(denom) > 1e-9) {
            const xi =
              (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) /
              denom;
            const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
            [bx1, by1] = [xi, yi];
          }
        }
      }
      _line(border_parent, bx1, by1, bx2, by2, border_bottom_width);
    }
  }

  private _render_image(parent: XmlElement, panel: LayoutedPanel): void {
    const r = panel.rect;
    const attrs = panel.attrs;
    if (!attrs.image) return;

    const image_path = join(this.source_dir, attrs.image);

    if (!existsSync(image_path)) {
      parent.sub("rect", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        fill: "#cccccc",
        opacity: "0.3",
      });
      parent
        .sub("text", {
          x: s(r.x + r.w / 2),
          y: s(r.y + r.h / 2),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "3",
          "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
          fill: "#666666",
        })
        .setText(`Image not found: ${attrs.image}`);
      return;
    }

    try {
      const image_data = readFileSync(image_path);
      const b64_data = image_data.toString("base64");
      const ext = extname(image_path).toLowerCase();
      const mime_types: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      const mime = mime_types[ext] ?? "image/png";
      const aspect_ratio_map: Record<string, string> = {
        cover: "xMidYMid slice",
        contain: "xMidYMid meet",
        fill: "none",
      };
      const aspect_ratio = aspect_ratio_map[attrs.imageFit] ?? "xMidYMid slice";

      parent.sub("image", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        href: `data:${mime};base64,${b64_data}`,
        preserveAspectRatio: aspect_ratio,
      });
    } catch (e) {
      parent
        .sub("text", {
          x: s(r.x + r.w / 2),
          y: s(r.y + r.h / 2),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": "3",
          "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
          fill: "#ff0000",
        })
        .setText(`Error: ${String(e)}`);
    }
  }

  private _render_text(parent: XmlElement, panel: LayoutedPanel): void {
    const r = panel.rect;
    const attrs = panel.attrs;
    if (!attrs.text) return;

    let text_elem: XmlElement;
    if (attrs.textDirection === "vertical") {
      text_elem = parent.sub("text", {
        x: s(r.x + r.w - 10),
        y: s(r.y + 10),
        "writing-mode": "vertical-rl",
        "font-size": "8",
        "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
        fill: "#000000",
      });
    } else {
      text_elem = parent.sub("text", {
        x: s(r.x + 10),
        y: s(r.y + 15),
        "font-size": "8",
        "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
        fill: "#000000",
      });
    }
    text_elem.setText(attrs.text);
  }

  // ── speech elements (balloon/monologue) ───────────────────────────────

  _draw_text_block(
    parent: XmlElement,
    rect: Rect,
    text: string,
    font_size: number,
    direction: string,
    color: string,
    align = "start",
    padding = 0.0,
  ): void {
    if (!text) return;

    const line_h = font_size * 1.4;
    const inset_rect = new Rect(
      rect.x + padding,
      rect.y + padding,
      Math.max(0.0, rect.w - 2 * padding),
      Math.max(0.0, rect.h - 2 * padding),
    );

    if (direction === "vertical") {
      const chars_per_col = Math.max(1, Math.trunc(inset_rect.h / (font_size * 1.0)));
      const colsArr: string[] = [];
      for (let i = 0; i < text.length; i += chars_per_col) {
        colsArr.push(text.slice(i, i + chars_per_col));
      }
      const cols = colsArr.length > 0 ? colsArr : [text];
      const block_w = cols.length * line_h;
      const col0_x = inset_rect.x + inset_rect.w / 2 + block_w / 2 - line_h / 2;
      const col_len = cols.reduce((m, c) => Math.max(m, c.length), 0);
      const block_h = col_len * font_size;
      let row0_y: number;
      if (align === "start") row0_y = inset_rect.y + font_size * 0.8;
      else if (align === "end")
        row0_y = inset_rect.y + inset_rect.h - block_h + font_size * 0.8;
      else row0_y = inset_rect.y + inset_rect.h / 2 - block_h / 2 + font_size * 0.8;
      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const cx = col0_x - ci * line_h;
        for (let chi = 0; chi < col.length; chi++) {
          const ch = col[chi];
          const [gx, gy] = _vertical_glyph_offset(ch, font_size);
          parent
            .sub("text", {
              x: s(cx + gx),
              y: s(row0_y + chi * font_size + gy),
              "text-anchor": "middle",
              "font-size": s(font_size),
              "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
              fill: color,
            })
            .setText(ch);
        }
      }
      return;
    }

    const chars_per_line = Math.max(1, Math.trunc(inset_rect.w / (font_size * 1.0)));
    const lines = _wrap_horizontal_text(text, chars_per_line);

    const anchor_map: Record<string, string> = { start: "start", center: "middle", end: "end" };
    const text_anchor = anchor_map[align] ?? "start";
    let tx: number;
    if (text_anchor === "start") tx = inset_rect.x;
    else if (text_anchor === "middle") tx = inset_rect.x + inset_rect.w / 2;
    else tx = inset_rect.x + inset_rect.w;

    const block_h = lines.length * line_h;
    const y0 = inset_rect.y + Math.max(0.0, (inset_rect.h - block_h) / 2) + font_size;

    const text_elem = parent.sub("text", {
      x: s(tx),
      y: s(y0),
      "text-anchor": text_anchor,
      "font-size": s(font_size),
      "font-family": "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif",
      fill: color,
    });
    for (let i = 0; i < lines.length; i++) {
      text_elem.sub("tspan", { x: s(tx), y: s(y0 + i * line_h) }).setText(lines[i]);
    }
  }

  private _render_speech(
    bg_parent: XmlElement,
    border_parent: XmlElement,
    speech: LayoutedSpeech,
    _defs: XmlElement | null = null,
  ): void {
    if (speech.kind === "balloon") {
      renderBalloon(this, bg_parent, speech);
    } else if (speech.kind === "monologue") {
      this._render_monologue(bg_parent, border_parent, speech);
    }
  }

  private _render_monologue(
    bg_parent: XmlElement,
    border_parent: XmlElement,
    speech: LayoutedSpeech,
  ): void {
    const r = speech.rect;
    const attrs = speech.attrs as import("../ast.js").MonologueAttrs;

    if (attrs.background !== "transparent" && attrs.background !== "none") {
      bg_parent.sub("rect", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        fill: attrs.background,
        stroke: "none",
      });
    }
    if (attrs.border > 0) {
      border_parent.sub("rect", {
        x: s(r.x),
        y: s(r.y),
        width: s(r.w),
        height: s(r.h),
        fill: "none",
        stroke: attrs.borderColor,
        "stroke-width": s(attrs.border),
      });
    }

    this._draw_text_block(
      bg_parent,
      r,
      attrs.text,
      attrs.fontSize,
      attrs.textDirection,
      attrs.textColor,
      attrs.align,
      attrs.padding,
    );
  }
}

// ── text wrapping / vertical glyph helpers ──────────────────────────────────

export function _wrap_horizontal_text(text: string, chars_per_line: number): string[] {
  if (!text.trim().includes(" ")) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += chars_per_line) {
      out.push(text.slice(i, i + chars_per_line));
    }
    return out.length > 0 ? out : [text];
  }

  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ");
    let current = "";
    for (let word of words) {
      while (word.length > chars_per_line) {
        if (current) {
          lines.push(current);
          current = "";
        }
        lines.push(word.slice(0, chars_per_line));
        word = word.slice(chars_per_line);
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= chars_per_line) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [text];
}

const _VERTICAL_PUNCT_OFFSET_RATIO: [number, number] = [0.42, -0.42];
const _VERTICAL_TOP_RIGHT_PUNCTUATION = "、。，．,.";

export function _vertical_glyph_offset(ch: string, font_size: number): [number, number] {
  if (_VERTICAL_TOP_RIGHT_PUNCTUATION.includes(ch)) {
    const [rx, ry] = _VERTICAL_PUNCT_OFFSET_RATIO;
    return [rx * font_size, ry * font_size];
  }
  return [0.0, 0.0];
}
