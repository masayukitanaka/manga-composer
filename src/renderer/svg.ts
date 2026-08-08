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

import type { Page, ImageLayer, SpeechAttrs } from "../ast.js";
import { DEFAULT_FONT_STACK, defaultSpeechAttrs } from "../ast.js";
import {
  Rect,
  LayoutedPanel,
  LayoutedSpeech,
  resolveImageLayerRect,
  resolveLineHeight,
  charAdvance,
} from "../layout/slicing.js";
import type { SkewLine, SkewHLine } from "../layout/slicing.js";
import { XmlElement } from "./xml.js";
import { parseRichText } from "./richtext.js";
import { renderBalloon } from "./balloonOutline.js";
import type { ImageLoader } from "./imageLoader.js";

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

/**
 * Geometry of a skewed panel, computed once and consumed by the fill, clip, and
 * border passes. All fields are absolute mm page coordinates. Extracted verbatim
 * from _render_skewed_panel so the three passes share one source of truth.
 */
interface SkewCorners {
  // Polygon corners: top-left, bottom-left, top-right, bottom-right.
  tl_x: number;
  bl_x: number;
  tr_x: number;
  br_x: number;
  tl_y: number;
  tr_y: number;
  bl_y: number;
  br_y: number;
  // Clip Y bounds (top/bottom of the clipped trapezoid).
  clip_y_min: number;
  clip_y_max: number;
  // Vertical-border Y extents (used when a side has no skewline of its own).
  left_top_y: number;
  right_top_y: number;
  left_bottom_y: number;
  right_bottom_y: number;
}

/**
 * Compute the corner/edge geometry for a skewed panel. Pure function of the
 * panel's layout state (shared skewlines/endpoints, own skew angles) and rect —
 * no drawing. The formulas are the ones previously inlined at the top of
 * _render_skewed_panel; branch order and arithmetic are unchanged.
 */
function _skew_corners(panel: LayoutedPanel, r: Rect): SkewCorners {
  const attrs = panel.attrs;

  const _eff = (own: number, adj: number): number => {
    if (own !== 0 && adj !== 0) return (own + adj) / 2;
    return own + adj;
  };

  // left_skew/right_skew/top_skew/bottom_skew computed for parity with Python;
  // only own skews feed the polygon-corner offsets below.
  void _eff(attrs.skewLeft, panel.adjacent_left_skew);
  void _eff(attrs.skewRight, panel.adjacent_right_skew);
  const top_skew = _eff(attrs.skewTop, panel.adjacent_top_skew);
  const bottom_skew = _eff(attrs.skewBottom, panel.adjacent_bottom_skew);

  const left_base_x = panel.shared_left_x !== null ? panel.shared_left_x : r.x;
  const right_base_x = panel.shared_right_x !== null ? panel.shared_right_x : r.x + r.w;

  const top_offset_y = top_skew !== 0 ? (r.w / 2) * Math.tan(radians(top_skew)) : 0;
  const bottom_offset_y = bottom_skew !== 0 ? (r.w / 2) * Math.tan(radians(bottom_skew)) : 0;
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

  // ── Clip Y bounds ────────────────────────────────────────────────────
  const clip_y_min = panel.shared_top_skewline ? Math.min(tl_y, tr_y) : r.y;
  const clip_y_max = panel.shared_bottom_skewline ? Math.max(bl_y, br_y) : r.y + r.h;

  // ── Vertical border Y extents ────────────────────────────────────────
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

  return {
    tl_x, bl_x, tr_x, br_x, tl_y, tr_y, bl_y, br_y,
    clip_y_min, clip_y_max,
    left_top_y, right_top_y, left_bottom_y, right_bottom_y,
  };
}

/**
 * Intersection of a skewed horizontal border line (`hsl`) with a skewed vertical
 * border line (`vsl`), used to close a skewed panel's corner exactly where the
 * top/bottom gutter meets the left/right gutter. Returns null when the lines are
 * (near-)parallel (`1 - tan_h·tan_v ≈ 0`), in which case the caller keeps its
 * existing endpoint. This is the exact formula that was previously inlined
 * verbatim at six corner sites in _render_skewed_panel.
 */
export function _skewline_intersection(hsl: SkewHLine, vsl: SkewLine): Point | null {
  const tan_h = Math.tan(radians(hsl.skew_angle));
  const tan_v = Math.tan(radians(vsl.skew_angle));
  const denom = 1 - tan_h * tan_v;
  if (Math.abs(denom) <= 1e-9) return null;
  const xi =
    (vsl.base_x + (hsl.base_y - vsl.mid_y) * tan_v - hsl.mid_x * tan_h * tan_v) / denom;
  const yi = hsl.base_y + (xi - hsl.mid_x) * tan_h;
  return [xi, yi];
}

const SPEECH_DEFAULT_Z = 100;

// Font-family for non-speech text drawn directly by the renderer: panel labels,
// the `panel.text` placeholder, and image-loading placeholder/error notes.
// NOTE: this is intentionally the shorter stack, NOT ast.ts's DEFAULT_FONT_STACK
// (which balloon/monologue text uses via `_draw_text_block`). Unifying the two
// would change output for panel-text/label fixtures — a separate, verified step.
const PLACEHOLDER_FONT_FAMILY = "Hiragino Sans, Hiragino Kaku Gothic Pro, sans-serif";

// Muted gray used for design-aid placeholder text (panel label, description).
const PLACEHOLDER_TEXT_COLOR = "#999999";
// Image-loading feedback: a light fill box + notes.
const IMAGE_MISSING_FILL = "#cccccc";
const IMAGE_MISSING_TEXT_COLOR = "#666666";
const IMAGE_ERROR_TEXT_COLOR = "#ff0000";
// Body/label text sizes (mm), as SVG font-size strings.
const LABEL_FONT_SIZE = "4";
const PLACEHOLDER_NOTE_FONT_SIZE = "3";
const PANEL_TEXT_FONT_SIZE = "8";
const BODY_TEXT_COLOR = "#000000";

// image_fit → SVG preserveAspectRatio.
const IMAGE_FIT_PRESERVE_ASPECT: Record<string, string> = {
  cover: "xMidYMid slice",
  contain: "xMidYMid meet",
  fill: "none",
};
// align → SVG text-anchor (horizontal text).
const ALIGN_TO_TEXT_ANCHOR: Record<string, string> = {
  start: "start",
  center: "middle",
  end: "end",
};

export class SVGRenderer {
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
  constructor(
    page: Page,
    panels: LayoutedPanel[],
    speeches: LayoutedSpeech[] | null = null,
    imageLoader: ImageLoader | null = null,
  ) {
    this.page = page;
    this.panels = panels;
    this.speeches = speeches ?? [];
    this.imageLoader = imageLoader;
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

    // `r` is the OFFSET-adjusted rect, not `panel.rect`: offsets grow the area
    // the panel actually draws, so layers must be placed and clipped against
    // it. Clipping to the raw rect cut a band off every image on an
    // `offset_*` panel.
    if (attrs.imageLayers.length > 0) this._render_image_layers(g, panel, r, defs);
    if (attrs.text) this._render_text(g, panel);

    if (attrs.label !== null) {
      const t = g.sub("text", {
        x: s(r.x + r.w / 2),
        y: s(r.y + r.h / 2),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": LABEL_FONT_SIZE,
        "font-family": PLACEHOLDER_FONT_FAMILY,
        fill: PLACEHOLDER_TEXT_COLOR,
      });
      t.setText(attrs.label ? attrs.label : panel.id);
    }

    // Panel description: a placeholder note shown only when requested and the
    // panel has no image layers yet (storyboard/script aid before art exists).
    if (attrs.showDescription && attrs.description && attrs.imageLayers.length === 0) {
      this._render_description(g, r, attrs.description);
    }
  }

  /** Render a panel's description as centered, wrapped, muted placeholder text. */
  private _render_description(parent: XmlElement, rect: Rect, description: string): void {
    const attrs = defaultSpeechAttrs();
    attrs.text = description;
    attrs.align = "center"; // horizontal centering
    attrs.anchorPos = "center"; // vertical centering (top_* anchors hug the top)
    attrs.padding = 3.0;
    this._draw_text_block(parent, rect, attrs, PLACEHOLDER_TEXT_COLOR);
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
    const c = _skew_corners(panel, r);
    this._skew_fill(g, panel, r, c);
    this._skew_clip(gb, panel, r, c, defs);
    this._skew_borders(border_parent, panel, r, c);
  }

  /** Fill the clipped panel trapezoid with the panel background. */
  private _skew_fill(g: XmlElement, panel: LayoutedPanel, r: Rect, c: SkewCorners): void {
    const attrs = panel.attrs;
    const clip_x_min =
      panel.shared_left_skewline || attrs.skewLeft !== 0 ? Math.min(c.tl_x, c.bl_x) : r.x;
    const clip_x_max =
      panel.shared_right_skewline || attrs.skewRight !== 0 ? Math.max(c.tr_x, c.br_x) : r.x + r.w;
    const poly_pts = _panel_fill_polygon(
      c.tl_x,
      c.tl_y,
      c.tr_x,
      c.tr_y,
      c.br_x,
      c.br_y,
      c.bl_x,
      c.bl_y,
      clip_x_min,
      c.clip_y_min,
      clip_x_max,
      c.clip_y_max,
    );
    if (poly_pts.length > 0) {
      const points_str = poly_pts.map(([x, y]) => `${x},${y}`).join(" ");
      g.sub("polygon", { points: points_str, fill: attrs.background, stroke: "none" });
    }
  }

  /** Register the per-panel clipPath and attach it to the border group. */
  private _skew_clip(
    gb: XmlElement,
    panel: LayoutedPanel,
    r: Rect,
    c: SkewCorners,
    defs: XmlElement | null,
  ): void {
    if (defs === null) return;
    const clip_id = `clip_${panel.id}`;
    const cp = defs.sub("clipPath", { id: clip_id });
    const clip_rect_y = c.clip_y_min;
    const clip_rect_h = c.clip_y_max - clip_rect_y;
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

  /** Draw the four (possibly-skewed) border edges. */
  private _skew_borders(
    border_parent: XmlElement,
    panel: LayoutedPanel,
    r: Rect,
    c: SkewCorners,
  ): void {
    const attrs = panel.attrs;
    const border_left_width = attrs.borderLeft !== null ? attrs.borderLeft : attrs.border;
    const border_right_width = attrs.borderRight !== null ? attrs.borderRight : attrs.border;
    const border_top_width = attrs.borderTop !== null ? attrs.borderTop : attrs.border;
    const border_bottom_width = attrs.borderBottom !== null ? attrs.borderBottom : attrs.border;

    const _line = (x1: number, y1: number, x2: number, y2: number, width: number): void => {
      border_parent.sub("line", {
        x1: s(x1),
        y1: s(y1),
        x2: s(x2),
        y2: s(y2),
        stroke: attrs.borderColor,
        "stroke-width": s(width),
      });
    };

    // Left border.
    if (panel.draw_left && border_left_width > 0) {
      if (panel.shared_left_skewline) {
        const sl = panel.shared_left_skewline;
        let [y1, y2] = panel.shared_left_skewline_y
          ? panel.shared_left_skewline_y
          : [r.y, r.y + r.h];
        if (!panel.shared_top_skewline) y1 = r.y;
        if (!panel.shared_bottom_skewline) y2 = r.y + r.h;
        _line(sl.x_at(y1), y1, sl.x_at(y2), y2, border_left_width);
      } else if (attrs.skewLeft !== 0) {
        _line(c.tl_x, c.tl_y, c.bl_x, c.bl_y, border_left_width);
      } else {
        _line(r.x, c.left_top_y, r.x, c.left_bottom_y, border_left_width);
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
        _line(sl.x_at(y1), y1, sl.x_at(y2), y2, border_right_width);
      } else if (attrs.skewRight !== 0) {
        _line(c.tr_x, c.tr_y, c.br_x, c.br_y, border_right_width);
      } else {
        _line(r.x + r.w, c.right_top_y, r.x + r.w, c.right_bottom_y, border_right_width);
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
        [tx1, ty1, tx2, ty2] = [c.tl_x, c.tl_y, c.tr_x, c.tr_y];
      }
      if (!panel.shared_top_skewline) {
        if (panel.shared_left_skewline) {
          tx1 = panel.shared_left_skewline.x_at(r.y);
          ty1 = r.y;
        } else if (attrs.skewLeft !== 0) {
          [tx1, ty1] = [c.tl_x, c.tl_y];
        }
        if (panel.shared_right_skewline) {
          tx2 = panel.shared_right_skewline.x_at(r.y);
          ty2 = r.y;
        } else if (attrs.skewRight !== 0) {
          [tx2, ty2] = [c.tr_x, c.tr_y];
        }
      } else {
        const hsl = panel.shared_top_skewline;
        if (panel.shared_right_skewline) {
          const p = _skewline_intersection(hsl, panel.shared_right_skewline);
          if (p) [tx2, ty2] = p;
        }
        if (panel.shared_left_skewline) {
          const p = _skewline_intersection(hsl, panel.shared_left_skewline);
          if (p) [tx1, ty1] = p;
        }
      }
      _line(tx1, ty1, tx2, ty2, border_top_width);
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
        [bx1, by1, bx2, by2] = [c.bl_x, c.bl_y, c.br_x, c.br_y];
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
        const p = _skewline_intersection(panel.shared_bottom_skewline, panel.shared_left_skewline);
        if (p) [bx1, by1] = p;
      } else if (attrs.skewLeft !== 0 && !panel.shared_bottom_skewline) {
        [bx1, by1] = [c.bl_x, c.bl_y];
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
        const p = _skewline_intersection(panel.shared_bottom_skewline, panel.shared_right_skewline);
        if (p) [bx2, by2] = p;
      } else if (attrs.skewRight !== 0 && !panel.shared_bottom_skewline) {
        [bx2, by2] = [c.br_x, c.br_y];
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
          const p = _skewline_intersection(hsl, panel.shared_right_skewline);
          if (p) [bx2, by2] = p;
        }
        if (panel.shared_left_skewline) {
          const p = _skewline_intersection(hsl, panel.shared_left_skewline);
          if (p) [bx1, by1] = p;
        }
      }
      _line(bx1, by1, bx2, by2, border_bottom_width);
    }
  }

  /**
   * Draw a panel's image layers back-to-front (array order = bottom→top; SVG's
   * later-wins painting matches). Each layer fits into its own placement rect
   * (resolveImageLayerRect); a layer with no placement attrs fills the panel,
   * matching the legacy single-`image` behavior. A missing/failing layer draws
   * its own placeholder so the other layers still render.
   */
  private _render_image_layers(
    parent: XmlElement,
    panel: LayoutedPanel,
    rect: Rect,
    defs: XmlElement | null,
  ): void {
    // A single clipPath (= the panel's DRAWN rect, offsets included) shared by
    // every clipped layer of this panel; created lazily so panels with no
    // clipped layer add nothing.
    let clip_ref: string | null = null;
    const ensureClip = (): string | null => {
      if (defs === null) return null;
      if (clip_ref === null) {
        const clip_id = `clip_imgs_${panel.id}`;
        const cp = defs.sub("clipPath", { id: clip_id });
        const r = rect;
        cp.sub("rect", { x: s(r.x), y: s(r.y), width: s(r.w), height: s(r.h) });
        clip_ref = `url(#${clip_id})`;
      }
      return clip_ref;
    };

    for (const layer of panel.attrs.imageLayers) {
      // Placement stays relative to the LAID-OUT rect, not the offset one: a
      // layer's `%` size/position means "of the panel", and offsets are a
      // presentation nudge for overlapping neighbours. Only the clip widens.
      const box = resolveImageLayerRect(layer, panel.rect);
      // Effective clip: layer.clip overrides the panel default (imageClip).
      const clip = layer.clip ?? panel.attrs.imageClip;
      const clip_path = clip ? ensureClip() : null;
      this._render_one_image_layer(parent, panel, layer, box, clip_path);
    }
  }

  private _render_one_image_layer(
    parent: XmlElement,
    panel: LayoutedPanel,
    layer: ImageLayer,
    box: Rect,
    clip_path: string | null,
  ): void {
    let loaded = null;
    try {
      loaded = this.imageLoader ? this.imageLoader(layer.path) : null;
    } catch (e) {
      parent
        .sub("text", {
          x: s(box.x + box.w / 2),
          y: s(box.y + box.h / 2),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": PLACEHOLDER_NOTE_FONT_SIZE,
          "font-family": PLACEHOLDER_FONT_FAMILY,
          fill: IMAGE_ERROR_TEXT_COLOR,
        })
        .setText(`Error: ${String(e)}`);
      return;
    }

    if (loaded === null) {
      const ph = parent.sub("rect", {
        x: s(box.x),
        y: s(box.y),
        width: s(box.w),
        height: s(box.h),
        fill: IMAGE_MISSING_FILL,
        opacity: "0.3",
      });
      if (clip_path !== null) ph.set("clip-path", clip_path);
      parent
        .sub("text", {
          x: s(box.x + box.w / 2),
          y: s(box.y + box.h / 2),
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": PLACEHOLDER_NOTE_FONT_SIZE,
          "font-family": PLACEHOLDER_FONT_FAMILY,
          fill: IMAGE_MISSING_TEXT_COLOR,
        })
        .setText(`Image not found: ${layer.path}`);
      return;
    }

    // Layer fit, else panel fit, else "cover".
    const fit = layer.imageFit ?? panel.attrs.imageFit ?? "cover";
    const aspect_ratio = IMAGE_FIT_PRESERVE_ASPECT[fit] ?? "xMidYMid slice";

    const img = parent.sub("image", {
      x: s(box.x),
      y: s(box.y),
      width: s(box.w),
      height: s(box.h),
      href: `data:${loaded.mime};base64,${loaded.dataBase64}`,
      preserveAspectRatio: aspect_ratio,
    });
    // Mirror horizontally about the box's center: scale(-1,1) about cx.
    if (layer.flipH) {
      const cx = box.x + box.w / 2;
      img.set("transform", `translate(${s(2 * cx)} 0) scale(-1 1)`);
    }
    if (clip_path !== null) img.set("clip-path", clip_path);
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
        "font-size": PANEL_TEXT_FONT_SIZE,
        "font-family": PLACEHOLDER_FONT_FAMILY,
        fill: BODY_TEXT_COLOR,
      });
    } else {
      text_elem = parent.sub("text", {
        x: s(r.x + 10),
        y: s(r.y + 15),
        "font-size": PANEL_TEXT_FONT_SIZE,
        "font-family": PLACEHOLDER_FONT_FAMILY,
        fill: BODY_TEXT_COLOR,
      });
    }
    text_elem.setText(attrs.text);
  }

  // ── speech elements (balloon/monologue) ───────────────────────────────

  _draw_text_block(
    parent: XmlElement,
    rect: Rect,
    attrs: SpeechAttrs,
    color: string,
  ): void {
    const text = attrs.text;
    if (!text) return;

    const font_size = attrs.fontSize;
    const direction = attrs.textDirection;
    const align = attrs.align;
    const padding = attrs.padding;
    const font_family = attrs.fontFamily || DEFAULT_FONT_STACK;
    const line_h = resolveLineHeight(attrs.lineHeight, font_size);
    const glyph_adv = font_size + attrs.letterSpacing; // per-glyph advance (H & V)

    // Per-character style, honoring inline <i>/<b> and element-wide defaults.
    const styled = _style_chars(text, {
      italic: attrs.fontStyle === "italic",
      bold: attrs.fontWeight === "bold",
    });

    const inset_rect = new Rect(
      rect.x + padding,
      rect.y + padding,
      Math.max(0.0, rect.w - 2 * padding),
      Math.max(0.0, rect.h - 2 * padding),
    );

    if (direction === "vertical") {
      // Vertical text runs top→bottom, columns right→left. An explicit newline
      // starts a new column; within a paragraph, wrap by how many glyphs fit in
      // the column height. `\n` is a hard column break, never a rendered glyph.
      // With wrap=false, a paragraph is never split — only `\n` breaks columns,
      // and text may overflow the box (author controls every break).
      const chars_per_col = attrs.wrap
        ? Math.max(1, Math.trunc(inset_rect.h / glyph_adv))
        : Number.POSITIVE_INFINITY;
      const cols: StyledChar[][] = [];
      for (const para of _split_styled(styled, "\n")) {
        if (para.length === 0) {
          cols.push([]); // blank line = empty column (spacing)
          continue;
        }
        for (let i = 0; i < para.length; i += chars_per_col) {
          cols.push(para.slice(i, i + chars_per_col));
        }
      }
      if (cols.length === 0) cols.push(styled);
      const block_w = cols.length * line_h;
      const col0_x = inset_rect.x + inset_rect.w / 2 + block_w / 2 - line_h / 2;
      const col_len = cols.reduce((m, c) => Math.max(m, c.length), 0);
      const block_h = col_len * glyph_adv;
      let row0_y: number;
      if (align === "start") row0_y = inset_rect.y + font_size * 0.8;
      else if (align === "end")
        row0_y = inset_rect.y + inset_rect.h - block_h + font_size * 0.8;
      else row0_y = inset_rect.y + inset_rect.h / 2 - block_h / 2 + font_size * 0.8;
      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const cx = col0_x - ci * line_h;
        for (let chi = 0; chi < col.length; chi++) {
          const { ch, italic, bold } = col[chi];
          // Base position: glyph centered on the column axis (cx), baseline at py.
          const px = cx;
          const py = row0_y + chi * glyph_adv;
          const glyphAttrs: Record<string, string> = {
            x: s(px),
            y: s(py),
            "text-anchor": "middle",
            "font-size": s(font_size),
            "font-family": font_family,
            fill: color,
          };
          if (italic) glyphAttrs["font-style"] = "italic";
          if (bold) glyphAttrs["font-weight"] = "bold";
          const tf = _vertical_glyph_transform(ch, font_size, px, py);
          if (tf) glyphAttrs.transform = tf;
          parent.sub("text", glyphAttrs).setText(ch);
        }
      }
      return;
    }

    // wrap=false: break only at explicit `\n`, allowing overflow. Otherwise
    // wrap to the inset box width, measuring each glyph's real advance.
    const max_line_w = attrs.wrap ? inset_rect.w : Number.POSITIVE_INFINITY;
    const lines = _wrap_horizontal_styled(
      styled,
      max_line_w,
      font_size,
      attrs.letterSpacing,
    );

    const text_anchor = ALIGN_TO_TEXT_ANCHOR[align] ?? "start";
    let tx: number;
    if (text_anchor === "start") tx = inset_rect.x;
    else if (text_anchor === "middle") tx = inset_rect.x + inset_rect.w / 2;
    else tx = inset_rect.x + inset_rect.w;

    // Vertically place the text block by the anchor's vertical intent: a
    // `top_*` anchor keeps text at the box top, `bottom_*` at the bottom, and
    // everything else (center/left/right) centers it. Otherwise an auto-tall box
    // (e.g. anchor_pos: top_left with estimated height) would center its text
    // and look like it's floating in the middle rather than at the top.
    const block_h = lines.length * line_h;
    const free_v = Math.max(0.0, inset_rect.h - block_h);
    let y0: number;
    if (attrs.anchorPos.startsWith("top")) {
      y0 = inset_rect.y + font_size;
    } else if (attrs.anchorPos.startsWith("bottom")) {
      y0 = inset_rect.y + free_v + font_size;
    } else {
      y0 = inset_rect.y + free_v / 2 + font_size;
    }

    const textAttrs: Record<string, string> = {
      x: s(tx),
      y: s(y0),
      "text-anchor": text_anchor,
      "font-size": s(font_size),
      "font-family": font_family,
      fill: color,
    };
    if (attrs.letterSpacing !== 0) textAttrs["letter-spacing"] = s(attrs.letterSpacing);
    const text_elem = parent.sub("text", textAttrs);
    for (let i = 0; i < lines.length; i++) {
      // Each line is emitted as one or more <tspan>s: a new tspan starts a new
      // line (x + y positioned), further tspans on the same line only carry the
      // decoration change. Empty lines still emit a positioned empty tspan.
      const runs = _group_styled_runs(lines[i]);
      const ly = s(y0 + i * line_h);
      if (runs.length === 0) {
        text_elem.sub("tspan", { x: s(tx), y: ly });
        continue;
      }
      for (let ri = 0; ri < runs.length; ri++) {
        const run = runs[ri];
        const tspanAttrs: Record<string, string> = ri === 0 ? { x: s(tx), y: ly } : {};
        if (run.italic) tspanAttrs["font-style"] = "italic";
        if (run.bold) tspanAttrs["font-weight"] = "bold";
        text_elem.sub("tspan", tspanAttrs).setText(run.text);
      }
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

    this._draw_text_block(bg_parent, r, attrs, attrs.textColor);
  }
}

// ── styled-text helpers (inline <i>/<b>) ────────────────────────────────────

export interface StyledChar {
  ch: string;
  italic: boolean;
  bold: boolean;
}

/** Expand marked-up text into a flat per-character style array. */
export function _style_chars(
  text: string,
  base: { italic: boolean; bold: boolean },
): StyledChar[] {
  const out: StyledChar[] = [];
  for (const run of parseRichText(text, base)) {
    for (const ch of run.text) out.push({ ch, italic: run.italic, bold: run.bold });
  }
  return out;
}

/** Split styled chars on a delimiter char (dropping the delimiter). */
function _split_styled(chars: StyledChar[], delim: string): StyledChar[][] {
  const parts: StyledChar[][] = [];
  let cur: StyledChar[] = [];
  for (const c of chars) {
    if (c.ch === delim) {
      parts.push(cur);
      cur = [];
    } else {
      cur.push(c);
    }
  }
  parts.push(cur);
  return parts;
}

/**
 * Wrap styled chars into lines. Mirrors `_wrap_horizontal_text`: `\n` is a hard
 * break; a paragraph with no spaces (CJK) wraps by char count; a space-separated
 * paragraph wraps on word boundaries. Returns a list of lines (each a
 * StyledChar[]).
 */
export function _wrap_horizontal_styled(
  chars: StyledChar[],
  max_width: number,
  font_size: number,
  letter_spacing = 0.0,
): StyledChar[][] {
  // Width (mm) of a run of styled chars, using the per-glyph advance model.
  const widthOf = (cs: StyledChar[]): number => {
    let w = 0;
    for (const c of cs) w += charAdvance(c.ch, font_size, letter_spacing);
    return w;
  };
  // With max_width = Infinity (wrap disabled), a paragraph never breaks.
  const noWrap = !Number.isFinite(max_width) || max_width <= 0;

  const lines: StyledChar[][] = [];
  for (const para of _split_styled(chars, "\n")) {
    if (para.length === 0) {
      lines.push([]);
      continue;
    }
    if (noWrap) {
      lines.push(para);
      continue;
    }
    const hasSpace = para.some((c) => c.ch === " ");
    if (!hasSpace) {
      // No spaces (CJK): break anywhere, accumulating width.
      let cur: StyledChar[] = [];
      let w = 0;
      for (const c of para) {
        const cw = charAdvance(c.ch, font_size, letter_spacing);
        if (cur.length > 0 && w + cw > max_width) {
          lines.push(cur);
          cur = [];
          w = 0;
        }
        cur.push(c);
        w += cw;
      }
      if (cur.length) lines.push(cur);
      continue;
    }
    // Word wrap for space-separated text (styles ride along per char).
    const words = _split_styled(para, " ");
    let current: StyledChar[] = [];
    const space: StyledChar = { ch: " ", italic: false, bold: false };
    for (let word of words) {
      // A single word wider than the line: hard-split it by width.
      while (widthOf(word) > max_width) {
        if (current.length) {
          lines.push(current);
          current = [];
        }
        let cut = 0;
        let w = 0;
        for (let i = 0; i < word.length; i++) {
          const cw = charAdvance(word[i].ch, font_size, letter_spacing);
          if (cut > 0 && w + cw > max_width) break;
          w += cw;
          cut = i + 1;
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = current.length > 0 ? [...current, space, ...word] : word;
      if (widthOf(candidate) <= max_width) {
        current = candidate;
      } else {
        if (current.length) lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [chars];
}

/** Group adjacent same-style chars in a line into runs for <tspan> output. */
export function _group_styled_runs(
  line: StyledChar[],
): { text: string; italic: boolean; bold: boolean }[] {
  const runs: { text: string; italic: boolean; bold: boolean }[] = [];
  for (const c of line) {
    const last = runs[runs.length - 1];
    if (last && last.italic === c.italic && last.bold === c.bold) {
      last.text += c.ch;
    } else {
      runs.push({ text: c.ch, italic: c.italic, bold: c.bold });
    }
  }
  return runs;
}

// ── vertical glyph helpers ──────────────────────────────────────────────────

const _VERTICAL_PUNCT_OFFSET_RATIO: [number, number] = [0.42, -0.42];
const _VERTICAL_TOP_RIGHT_PUNCTUATION = "、。，．,.";

// Small kana (拗音・促音): in vertical Japanese these sit slightly smaller and
// pushed toward the top-right of the cell rather than centered.
const _VERTICAL_SMALL_KANA = new Set([
  "ゃ", "ゅ", "ょ", "っ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゎ", "ゕ", "ゖ",
  "ャ", "ュ", "ョ", "ッ", "ァ", "ィ", "ゥ", "ェ", "ォ", "ヮ", "ヵ", "ヶ",
]);
const _SMALL_KANA_SCALE = 0.78;
const _SMALL_KANA_DX_RATIO = 0.11; // → right
const _SMALL_KANA_DY_RATIO = 0.14; // → up (subtracted from y)

// A glyph's approximate visual center above the baseline, as a fraction of the
// font size. Used as the rotation pivot so rotated glyphs stay on the column
// axis (x = cx) rather than drifting sideways.
const _GLYPH_CENTER_RATIO = 0.36;

/**
 * Characters that must be rotated 90° clockwise when set vertically, so a
 * horizontal glyph (long-vowel mark, dashes, brackets, wave dash…) reads as a
 * vertical stroke. Matches the common set browsers rotate for `text-orientation:
 * upright` exceptions / vertical CJK typesetting.
 */
const _VERTICAL_ROTATE_GLYPHS = new Set([
  "ー", // 長音符
  "-", "‐", "‑", "–", "—", "―", // hyphen / dashes / horizontal bar
  "…", // 三点リーダ（横棒感が強いので回転）
  "～", "〜", "~", // wave dash / tilde
  "(", ")", "（", "）",
  "[", "]", "「", "」", "『", "』", "【", "】", "〔", "〕",
  "{", "}", "｛", "｝",
  "<", ">", "＜", "＞", "〈", "〉", "《", "》",
  "=", "＝",
  "^", "＾",
]);

// Rotation pivot height above the baseline, as a fraction of font size. Chosen
// empirically (with the default font stack) so rotated glyphs — comparison marks
// ＜＞, dashes ー, brackets 「」 — land on the column axis instead of drifting
// sideways. See the pivot-comparison note in .private/FONT.md.
const _ROTATE_PIVOT_RATIO = 0.28;

/** Whether a character should be rotated 90° when drawn in vertical text. */
export function _vertical_glyph_rotate(ch: string): boolean {
  return _VERTICAL_ROTATE_GLYPHS.has(ch);
}

/** Whether a character is a small kana that gets shrunk + shifted top-right. */
export function _vertical_glyph_is_small_kana(ch: string): boolean {
  return _VERTICAL_SMALL_KANA.has(ch);
}

/**
 * SVG `transform` for a vertically-set glyph drawn at column-center `px` and
 * baseline `py` (with text-anchor="middle"), or "" if none is needed:
 *   - rotate glyphs (ー, dashes, brackets) 90° about their visual center, so the
 *     horizontal stroke reads vertical and stays centered on the column axis;
 *   - small kana (ゃゅょっ…) shrink and nudge toward the top-right of the cell;
 *   - top-right punctuation (、。) nudge toward the top-right.
 */
export function _vertical_glyph_transform(
  ch: string,
  font_size: number,
  px: number,
  py: number,
): string {
  if (_vertical_glyph_rotate(ch)) {
    const cy = py - font_size * _ROTATE_PIVOT_RATIO;
    return `rotate(90 ${s(px)} ${s(cy)})`;
  }
  if (_vertical_glyph_is_small_kana(ch)) {
    const dx = font_size * _SMALL_KANA_DX_RATIO;
    const dy = -font_size * _SMALL_KANA_DY_RATIO;
    // Scale about the glyph's visual center (px, cy) so it shrinks in place,
    // then translate toward the top-right.
    const cy = py - font_size * _GLYPH_CENTER_RATIO;
    const t = 1 - _SMALL_KANA_SCALE;
    // scale-about-point (px,cy): translate(px*t, cy*t) then scale(s)
    return (
      `translate(${s(dx + px * t)} ${s(dy + cy * t)}) ` +
      `scale(${s(_SMALL_KANA_SCALE)})`
    );
  }
  if (_VERTICAL_TOP_RIGHT_PUNCTUATION.includes(ch)) {
    const [rx, ry] = _VERTICAL_PUNCT_OFFSET_RATIO;
    return `translate(${s(rx * font_size)} ${s(ry * font_size)})`;
  }
  return "";
}
