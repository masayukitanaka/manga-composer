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
 * Output is internally deterministic. The SVG-diff
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

/** Where a balloon's tail attaches to the outline, and where its tip lands. */
export interface BalloonTail {
  /** Point on the balloon outline the tail grows from (mm, page coords). */
  rootX: number;
  rootY: number;
  /** Tail tip (mm, page coords) — `tailLength` out along the root's radial. */
  tipX: number;
  tipY: number;
}

/**
 * Balloon geometry shared by rendering and by hosts that need to position UI
 * (the editor's draggable tail handle). Kept in one place so a handle can never
 * drift from the drawn tail.
 *
 * `rx`/`ry` reproduce the aspect_ratio reshape; the tail root comes out of the
 * SAME seeded outline generator the renderer uses, so the jittered radius is
 * identical rather than an idealized ellipse point.
 */
function _balloon_geometry(speech: LayoutedSpeech): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  has_tail: boolean;
  tail_edge: string | null;
  tail_pos: number;
  seed: number;
} {
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

  const has_tail = speech.has_tail && attrs.shape !== "thought";
  let tail_edge: string | null = null;
  let tail_pos = 50.0;
  if (has_tail) {
    const math_angle = radians(attrs.tailAngle - 90.0);
    [tail_edge, tail_pos] = _angle_to_edge_pos(math_angle);
  }

  return { cx, cy, rx, ry, has_tail, tail_edge, tail_pos, seed: speechSeed(r, attrs.shape) };
}

/** Build the outline point list for a balloon, and the tail's index within it. */
function _balloon_outline(
  speech: LayoutedSpeech,
  g: ReturnType<typeof _balloon_geometry>,
): { points: Point[]; tail_index: number | null; sharp: number[] } {
  const attrs = speech.attrs as BalloonAttrs;
  const { cx, cy, rx, ry, tail_edge, tail_pos, seed } = g;

  if (attrs.shape === "oval" || attrs.shape === "whisper" || attrs.shape === "thought") {
    const [points, tail_index] = _ellipse_outline_points(
      cx, cy, rx, ry, tail_edge, tail_pos, seed, 16, attrs.jitter,
    );
    return { points, tail_index, sharp: [] };
  }
  if (attrs.shape === "shout" || attrs.shape === "jagged" || attrs.shape === "explosion") {
    const [points, tail_index, sharp] = _star_outline_points(
      cx, cy, rx, ry, attrs.shape, tail_edge, tail_pos, seed, attrs.innerRatio, attrs.jitter,
    );
    return { points, tail_index, sharp };
  }
  // rounded_box. Unlike the organic shapes, this one attaches the tail by
  // intersecting the real tail ray with the real box (see
  // `_rounded_rect_outline_points`), so it takes the angle rather than the
  // edge/percent pair.
  const tail_angle = tail_edge === null ? null : radians(attrs.tailAngle - 90.0);
  const [points, tail_index, sharp] = _rounded_rect_outline_points(
    cx, cy, rx, ry, attrs.cornerRadius, tail_angle,
  );
  return { points, tail_index, sharp };
}

/**
 * Resolve a balloon's tail root and tip in page mm, or null when it has none
 * (`has_tail` false, or a `thought` balloon, which draws a trail of circles
 * instead of a fused tail).
 *
 * This is the function an editor should use to place a tail handle: it runs the
 * same seeded outline generation as `renderBalloon`, so the returned root sits
 * exactly on the drawn (jittered) outline.
 */
export function resolveBalloonTail(speech: LayoutedSpeech): BalloonTail | null {
  if (speech.kind !== "balloon") return null;
  const attrs = speech.attrs as BalloonAttrs;
  const g = _balloon_geometry(speech);
  if (!g.has_tail) return null;

  const { points, tail_index } = _balloon_outline(speech, g);
  if (tail_index === null) return null;

  const root = points[tail_index];
  const [tipX, tipY] = _tail_tip(root, g.cx, g.cy, attrs.tailLength);
  return { rootX: root[0], rootY: root[1], tipX, tipY };
}

/** Tail tip: `length` out from `root` along the ray from the balloon centre. */
function _tail_tip(root: Point, cx: number, cy: number, length: number): Point {
  const dx = root[0] - cx;
  const dy = root[1] - cy;
  const dist = Math.hypot(dx, dy) || 1.0;
  return [root[0] + (dx / dist) * length, root[1] + (dy / dist) * length];
}

// ── main render entry (port of svg.py _render_balloon) ──────────────────────

export function renderBalloon(
  renderer: SVGRenderer,
  parent: XmlElement,
  speech: LayoutedSpeech,
): void {
  const r = speech.rect;
  const attrs = speech.attrs as BalloonAttrs;
  // Geometry + outline come from the shared helpers, so `resolveBalloonTail`
  // (used by editors to place a tail handle) can never disagree with what is
  // actually drawn here.
  const g = _balloon_geometry(speech);
  const { cx, cy, rx, ry, has_tail } = g;

  const common: Record<string, string> = {
    fill: attrs.background,
    stroke: attrs.borderColor,
    "stroke-width": s(attrs.border),
  };

  let { points, tail_index, sharp } = _balloon_outline(speech, g);

  if (has_tail && tail_index !== null) {
    const tip = _tail_tip(points[tail_index], cx, cy, attrs.tailLength);
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

  renderer._draw_text_block(parent, r, attrs, "#000000");
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

/**
 * Outline for `rounded_box`, with the tail spliced in at `tail_angle`.
 *
 * The tail attaches where the ray from the centre actually leaves the box —
 * NOT via the edge+percent pair the organic shapes use. That pair maps each 90°
 * wedge linearly onto one side, which only matches a real rectangle at the four
 * wedge centres (0/90/180/270); in between, the attachment drifted, and along
 * the bottom/left edges the percent even ran opposite to the sweep direction, so
 * e.g. `tail_angle: 220` (down-left) came out on the bottom-RIGHT.
 */
function _rounded_rect_outline_points(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  corner_radius: number,
  tail_angle: number | null,
): [Point[], number | null, number[]] {
  const x0 = cx - rx;
  const y0 = cy - ry;
  const x1 = cx + rx;
  const y1 = cy + ry;
  const r = Math.max(0.0, Math.min(corner_radius, rx, ry));
  // The corner arcs are drawn as polylines (see sharp_indices below), so the
  // step count sets how round they look. Scale with the radius — a fixed count
  // leaves big corners visibly faceted. Targets ≲1mm per step, which is well
  // under what's visible at print size.
  const arc_steps = Math.max(4, Math.ceil((r * Math.PI) / 2));

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
    // Join every point with straight lines rather than Catmull-Rom.
    //
    // This shape is exact geometry, not a hand-drawn wobble: the arc points
    // already lie on the corner circle, and the sides are dead straight. Running
    // them through the smoothing spline made the curve overshoot where point
    // spacing jumps (arc ~2mm vs. a 28mm side), which showed up as a kink/bulge
    // right where each corner meets its edge. Sampling the arcs finely gives a
    // smooth corner without any spline.
    sharp_indices = points.map((_, i) => i);
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
  if (tail_angle !== null) {
    const tp = _ray_exit_on_rect(cx, cy, x0, y0, x1, y1, tail_angle);
    // Splice the tail point into the segment it actually lies on, so its
    // neighbours are the two ends of that segment. `_insert_tail_notch` builds
    // the tail's base direction from `next - prev`, so attaching it anywhere
    // else yields a bogus direction (pinched or sideways tails).
    const insert_after = _find_segment_containing(points, tp);
    points.splice(insert_after + 1, 0, tp);
    sharp_indices = sharp_indices.map((idx) => (idx > insert_after ? idx + 1 : idx));
    tail_index = insert_after + 1;
    // The spliced tail point is part of the same straight-line outline, so it is
    // sharp as well — otherwise the two segments either side of it get splined
    // and the tail base bows.
    if (r > 0) sharp_indices.push(tail_index);
  }

  return [points, tail_index, sharp_indices];
}

/**
 * Where the ray from the box centre at `angle` crosses the box boundary.
 *
 * Uses the rectangle itself, not the corner-rounded outline: the tail should
 * leave from the side it points at, and a tail aimed into a rounded corner still
 * reads correctly when rooted on the straight part next to it.
 */
function _ray_exit_on_rect(
  cx: number,
  cy: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  angle: number,
): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Distance along the ray to each bounding line; the nearest positive one is
  // the side the ray actually exits through.
  let t = Infinity;
  if (Math.abs(dx) > 1e-9) {
    const tx = dx > 0 ? (x1 - cx) / dx : (x0 - cx) / dx;
    if (tx > 0) t = Math.min(t, tx);
  }
  if (Math.abs(dy) > 1e-9) {
    const ty = dy > 0 ? (y1 - cy) / dy : (y0 - cy) / dy;
    if (ty > 0) t = Math.min(t, ty);
  }
  if (!Number.isFinite(t)) return [x1, cy];
  // Clamp against rounding so the point never lands a hair outside the box.
  const px = Math.min(x1, Math.max(x0, cx + dx * t));
  const py = Math.min(y1, Math.max(y0, cy + dy * t));
  return [px, py];
}

/**
 * Index of the point starting the outline segment that `p` lies on (or is
 * nearest to). The tail point is spliced in right after it.
 */
function _find_segment_containing(points: Point[], p: Point): number {
  let best = points.length - 1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-12) continue;
    // Projection of p onto the segment, clamped to it.
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
    const qx = a[0] + vx * u;
    const qy = a[1] + vy * u;
    const dist = Math.hypot(p[0] - qx, p[1] - qy);
    if (dist < bestDist - 1e-9) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
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
