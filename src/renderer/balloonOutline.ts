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
import type { BalloonAttrs } from "../ast.js";
import { SeededJitter, speechSeed } from "../prng.js";

type Point = [number, number];

const radians = (deg: number): number => (deg * Math.PI) / 180;
const s = (n: number): string => String(n);

// ── main render entry (port of svg.py _render_balloon) ──────────────────────

export function renderBalloon(
  renderer: SVGRenderer,
  parent: XmlElement,
  speech: LayoutedSpeech,
): void {
  const r = speech.rect;
  const attrs = speech.attrs as BalloonAttrs;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let rx = r.w / 2;
  let ry = r.h / 2;

  // aspect_ratio: area-preserving reshape only when neither width nor height
  // was set explicitly (else layout already applied it).
  if (
    attrs.aspectRatio !== null &&
    attrs.aspectRatio > 0 &&
    attrs.width === null &&
    attrs.height === null
  ) {
    const area_r = rx * ry;
    ry = Math.sqrt(area_r * attrs.aspectRatio);
    rx = ry > 0 ? area_r / ry : rx;
  }

  const common: Record<string, string> = {
    fill: attrs.background,
    stroke: attrs.borderColor,
    "stroke-width": s(attrs.border),
  };

  const has_tail = speech.has_tail && attrs.shape !== "thought";
  let tail_edge: string | null = null;
  let tail_pos = 50.0;
  if (has_tail) {
    const math_angle = radians(attrs.tailAngle - 90.0);
    [tail_edge, tail_pos] = _angle_to_edge_pos(math_angle);
  }

  const seed = speechSeed(r, attrs.shape);

  let points: Point[];
  let tail_index: number | null;
  let sharp: number[];
  if (attrs.shape === "oval" || attrs.shape === "whisper" || attrs.shape === "thought") {
    [points, tail_index] = _ellipse_outline_points(
      cx,
      cy,
      rx,
      ry,
      tail_edge,
      tail_pos,
      seed,
      16,
      attrs.jitter,
    );
    sharp = [];
  } else if (attrs.shape === "shout" || attrs.shape === "jagged" || attrs.shape === "explosion") {
    [points, tail_index, sharp] = _star_outline_points(
      cx,
      cy,
      rx,
      ry,
      attrs.shape,
      tail_edge,
      tail_pos,
      seed,
      attrs.innerRatio,
      attrs.jitter,
    );
  } else {
    // rounded_box
    [points, tail_index, sharp] = _rounded_rect_outline_points(
      cx,
      cy,
      rx,
      ry,
      attrs.cornerRadius,
      tail_edge,
      tail_pos,
    );
  }

  if (has_tail && tail_index !== null) {
    const root = points[tail_index];
    const dx = root[0] - cx;
    const dy = root[1] - cy;
    const dist = Math.hypot(dx, dy) || 1.0;
    const ux = dx / dist;
    const uy = dy / dist;
    const tip: Point = [root[0] + ux * attrs.tailLength, root[1] + uy * attrs.tailLength];
    [points, sharp] = _insert_tail_notch(points, tail_index, tip, sharp);
  }

  const path_elem = parent.sub("path", { d: _points_to_smooth_path_d(points, sharp), ...common });
  if (attrs.shape === "whisper") {
    path_elem.set("stroke-dasharray", "2,1.5");
  }

  // "thought" balloons: a trail of shrinking circles instead of a fused tail.
  if (speech.has_tail && attrs.shape === "thought") {
    const math_angle = radians(attrs.tailAngle - 90.0);
    const bx = cx + rx * Math.cos(math_angle);
    const by = cy + ry * Math.sin(math_angle);
    const dx = bx - cx;
    const dy = by - cy;
    const dist = Math.hypot(dx, dy) || 1.0;
    const ux = dx / dist;
    const uy = dy / dist;
    const step = attrs.tailLength / 3;
    const radii = [2.5, 1.5, 0.8];
    for (let i = 0; i < radii.length; i++) {
      const cr = radii[i];
      const ox = bx + ux * step * (i + 1);
      const oy = by + uy * step * (i + 1);
      parent.sub("circle", { cx: s(ox), cy: s(oy), r: s(cr), ...common });
    }
  }

  renderer._draw_text_block(
    parent,
    r,
    attrs.text,
    attrs.fontSize,
    attrs.textDirection,
    "#000000",
    attrs.align,
    attrs.padding,
  );
}

// ── angle helpers ───────────────────────────────────────────────────────────

function _angle_to_edge_pos(math_angle: number): [string, number] {
  const two_pi = 2 * Math.PI;
  const a = ((math_angle % two_pi) + two_pi) % two_pi;

  const wedge_pos = (center: number): number | null => {
    const lo = ((center - Math.PI / 4) % two_pi + two_pi) % two_pi;
    const offset = ((a - lo) % two_pi + two_pi) % two_pi;
    if (offset <= Math.PI / 2) return (offset / (Math.PI / 2)) * 100.0;
    return null;
  };

  for (const [edge, center] of [
    ["right", 0.0],
    ["bottom", Math.PI / 2],
    ["left", Math.PI],
    ["top", (3 * Math.PI) / 2],
  ] as [string, number][]) {
    const pos = wedge_pos(center);
    if (pos !== null) return [edge, pos];
  }
  return ["right", 50.0];
}

function _edge_pos_to_angle(edge: string, pos_pct: number): number {
  const t = Math.max(0.0, Math.min(100.0, pos_pct)) / 100.0;
  let angle: number;
  if (edge === "right") angle = -Math.PI / 4 + t * (Math.PI / 2);
  else if (edge === "bottom") angle = Math.PI / 4 + t * (Math.PI / 2);
  else if (edge === "left") angle = (3 * Math.PI) / 4 + t * (Math.PI / 2);
  else angle = (-3 * Math.PI) / 4 + t * (Math.PI / 2);
  const two_pi = 2 * Math.PI;
  return ((angle % two_pi) + two_pi) % two_pi;
}

function _angle_between(a: number, a0: number, a1: number): boolean {
  const two_pi = 2 * Math.PI;
  a = ((a % two_pi) + two_pi) % two_pi;
  a0 = ((a0 % two_pi) + two_pi) % two_pi;
  a1 = ((a1 % two_pi) + two_pi) % two_pi;
  if (a0 <= a1) return a0 <= a && a < a1;
  return a >= a0 || a < a1;
}

// ── outline generators ──────────────────────────────────────────────────────

function _ellipse_outline_points(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  edge: string | null,
  pos_pct: number,
  seed: number,
  n = 16,
  jitter_scale = 1.0,
): [Point[], number | null] {
  const jitter = new SeededJitter(seed);
  const amplitude = 0.06 * jitter_scale;

  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push((2 * Math.PI * i) / n);

  let tail_angle: number | null = null;
  if (edge !== null) {
    tail_angle = _edge_pos_to_angle(edge, pos_pct);
    angles.push(tail_angle);
    angles.sort((p, q) => p - q);
  }

  const points: Point[] = [];
  let tail_index: number | null = null;
  for (const angle of angles) {
    const r_jitter = 1.0 + jitter.uniform(-amplitude, amplitude);
    const px = cx + rx * r_jitter * Math.cos(angle);
    const py = cy + ry * r_jitter * Math.sin(angle);
    if (tail_angle !== null && angle === tail_angle) {
      tail_index = points.length;
    }
    points.push([px, py]);
  }

  return [points, tail_index];
}

function _star_outline_points(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  shape: string,
  edge: string | null,
  pos_pct: number,
  seed: number,
  inner_ratio: number | null = null,
  jitter_scale = 1.0,
): [Point[], number | null, number[]] {
  const jitter = new SeededJitter(seed);
  const n_points = 14;
  let inner_center: number;
  if (inner_ratio !== null) {
    inner_center = Math.max(0.05, Math.min(0.95, inner_ratio));
  } else if (shape === "shout" || shape === "explosion") {
    inner_center = 0.625;
  } else {
    inner_center = 0.765;
  }
  const half_width = 0.125 * jitter_scale;
  const inner_lo = inner_center - half_width;
  const inner_hi = inner_center + half_width;
  const mark_outer_sharp = shape !== "explosion";

  const angles: number[] = [];
  const is_outer: boolean[] = [];
  for (let i = 0; i < n_points * 2; i++) {
    angles.push((Math.PI * i) / n_points);
    is_outer.push(i % 2 === 0);
  }

  let tail_angle: number | null = null;
  if (edge !== null) {
    tail_angle = _edge_pos_to_angle(edge, pos_pct);
  }

  const points: Point[] = [];
  let sharp_indices: number[] = [];
  let tail_index: number | null = null;
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const outer = is_outer[i];
    const radius_scale = outer ? 1.0 : jitter.uniform(inner_lo, inner_hi);
    const px = cx + rx * radius_scale * Math.cos(angle);
    const py = cy + ry * radius_scale * Math.sin(angle);
    if (outer && mark_outer_sharp) sharp_indices.push(points.length);
    points.push([px, py]);
  }

  if (tail_angle !== null) {
    let insert_at = points.length;
    for (let i = 0; i < angles.length; i++) {
      const a0 = angles[i];
      const a1 = angles[(i + 1) % angles.length];
      if (_angle_between(tail_angle, a0, a1)) {
        insert_at = i + 1;
        break;
      }
    }
    const tx = cx + rx * ((inner_lo + inner_hi) / 2) * Math.cos(tail_angle);
    const ty = cy + ry * ((inner_lo + inner_hi) / 2) * Math.sin(tail_angle);
    points.splice(insert_at, 0, [tx, ty]);
    sharp_indices = sharp_indices.map((idx) => (idx >= insert_at ? idx + 1 : idx));
    tail_index = insert_at;
  }

  return [points, tail_index, sharp_indices];
}

function _rounded_rect_outline_points(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  corner_radius: number,
  edge: string | null,
  pos_pct: number,
): [Point[], number | null, number[]] {
  const x0 = cx - rx;
  const y0 = cy - ry;
  const x1 = cx + rx;
  const y1 = cy + ry;
  const r = Math.max(0.0, Math.min(corner_radius, rx, ry));
  const arc_steps = 4;

  const arc = (center: Point, start_angle: number, end_angle: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= arc_steps; i++) {
      const t = i / arc_steps;
      const a = start_angle + (end_angle - start_angle) * t;
      pts.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
    }
    return pts;
  };

  let points: Point[] = [];
  let sharp_indices: number[] = [];
  if (r > 0) {
    points = points.concat(arc([x1 - r, y0 + r], -Math.PI / 2, 0));
    points = points.concat(arc([x1 - r, y1 - r], 0, Math.PI / 2));
    points = points.concat(arc([x0 + r, y1 - r], Math.PI / 2, Math.PI));
    points = points.concat(arc([x0 + r, y0 + r], Math.PI, (3 * Math.PI) / 2));
  } else {
    points = [
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ];
    sharp_indices = [0, 1, 2, 3];
  }

  let tail_index: number | null = null;
  if (edge !== null) {
    const t = Math.max(0.0, Math.min(100.0, pos_pct)) / 100.0;
    let tp: Point;
    let insert_after: number;
    if (edge === "top") {
      tp = [x0 + (x1 - x0) * t, y0];
      insert_after = _find_edge_segment(points, "top", x0, x1, y0);
    } else if (edge === "bottom") {
      tp = [x0 + (x1 - x0) * t, y1];
      insert_after = _find_edge_segment(points, "bottom", x0, x1, y1);
    } else if (edge === "left") {
      tp = [x0, y0 + (y1 - y0) * t];
      insert_after = _find_edge_segment(points, "left", y0, y1, x0);
    } else {
      tp = [x1, y0 + (y1 - y0) * t];
      insert_after = _find_edge_segment(points, "right", y0, y1, x1);
    }
    points.splice(insert_after + 1, 0, tp);
    sharp_indices = sharp_indices.map((idx) => (idx > insert_after ? idx + 1 : idx));
    tail_index = insert_after + 1;
  }

  return [points, tail_index, sharp_indices];
}

function _find_edge_segment(
  points: Point[],
  edge: string,
  a0: number,
  a1: number,
  fixed: number,
): number {
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    if (
      (edge === "top" || edge === "bottom") &&
      Math.abs(py - fixed) < 1e-6 &&
      Math.min(a0, a1) <= px &&
      px <= Math.max(a0, a1)
    ) {
      return i;
    }
    if (
      (edge === "left" || edge === "right") &&
      Math.abs(px - fixed) < 1e-6 &&
      Math.min(a0, a1) <= py &&
      py <= Math.max(a0, a1)
    ) {
      return i;
    }
  }
  return points.length - 1;
}

function _insert_tail_notch(
  points: Point[],
  tail_index: number | null,
  tip: Point,
  existing_sharp: number[] | null = null,
): [Point[], number[]] {
  if (tail_index === null) {
    return [points, [...(existing_sharp ?? [])]];
  }

  const root = points[tail_index];
  const prev_pt = points[tail_index - 1];
  const next_pt = points[(tail_index + 1) % points.length];

  const tx = next_pt[0] - prev_pt[0];
  const ty = next_pt[1] - prev_pt[1];
  const tlen = Math.hypot(tx, ty) || 1.0;
  const ux = tx / tlen;
  const uy = ty / tlen;
  const half = 2.1;
  const root_left: Point = [root[0] - ux * half, root[1] - uy * half];
  const root_right: Point = [root[0] + ux * half, root[1] + uy * half];

  const new_points = [
    ...points.slice(0, tail_index),
    root_left,
    tip,
    root_right,
    ...points.slice(tail_index + 1),
  ];
  const notch_sharp = [tail_index, tail_index + 1, tail_index + 2];

  const reindexed = (existing_sharp ?? []).map((i) => (i < tail_index ? i : i + 2));
  const merged = new Set<number>([...notch_sharp, ...reindexed]);
  return [new_points, [...merged].sort((p, q) => p - q)];
}

function _points_to_smooth_path_d(points: Point[], sharp_indices: number[] | null = null): string {
  const n = points.length;
  if (n < 3) return "";
  const sharp = new Set(sharp_indices ?? []);

  const catmull_rom_to_bezier = (p0: Point, p1: Point, p2: Point, p3: Point): [Point, Point] => {
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return [c1, c2];
  };

  const fmt = (x: number): string => x.toFixed(3);
  const d: string[] = [`M ${fmt(points[0][0])},${fmt(points[0][1])}`];
  for (let i = 0; i < n; i++) {
    const i_next = (i + 1) % n;
    const p1 = points[i];
    const p2 = points[i_next];
    const touches_sharp = sharp.has(i) || sharp.has(i_next);
    if (touches_sharp) {
      d.push(`L ${fmt(p2[0])},${fmt(p2[1])}`);
    } else {
      const p0 = points[(i - 1 + n) % n];
      const p3 = points[(i + 2) % n];
      const [c1, c2] = catmull_rom_to_bezier(p0, p1, p2, p3);
      d.push(`C ${fmt(c1[0])},${fmt(c1[1])} ${fmt(c2[0])},${fmt(c2[1])} ${fmt(p2[0])},${fmt(p2[1])}`);
    }
  }
  d.push("Z");
  return d.join(" ");
}
