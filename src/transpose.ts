/**
 * `transpose` — mirror a parsed .manga page left↔right (rtl⇄ltr).
 *
 * Spec: .private/TRANSPOSE_COMMAND.md. This module is the pure, I/O-free core:
 * it takes a parsed `Page` and returns a NEW transformed `Page` plus a list of
 * warnings. The CLI (cli.ts) handles source/image output; nothing here reads or
 * writes files, parses, or serializes.
 *
 * Design promise (do not break existing behavior): this never mutates its input
 * — it deep-clones first — and only rewrites attributes with a left/right sense.
 * Everything else is copied verbatim, so a round-trip through serialize stays
 * valid and untouched fields are byte-identical.
 *
 * SAFE CORE (implemented here, no layout needed):
 *   - page.direction rtl⇄ltr, padding_left⇄padding_right
 *   - align start⇄end (row/col/speech), anchor_pos left⇄right
 *   - skew_left⇄skew_right and sign-flip all skews
 *   - offset_left⇄offset_right, border_left⇄border_right, margin_left⇄margin_right
 *   - dx sign-flip (speech + image layers), image flip_h toggle
 *   - image-layer `x` in `%` units (panel-relative, resolvable without layout)
 *   - tail_angle horizontal mirror
 *   - text_direction vertical⇄horizontal (only when opts.text)
 *
 * DEFERRED (needs layout; emits a warning and keeps the value unchanged):
 *   - balloon/monologue absolute `x` (mm) mirror — needs page/box width
 *   - image-layer `x` in `mm` — needs panel width
 * See .private/TRANSPOSE_COMMAND.md §6/§7.
 */

import type {
  Page,
  PageConfig,
  LayoutNode,
  RowNode,
  ColNode,
  PanelNode,
  SpeechNode,
  BalloonAttrs,
  SpeechAttrs,
  ImageLayer,
  Align,
  AnchorPos,
  Direction,
  TextDirection,
  Length,
} from "./ast.js";

export interface TransposeOptions {
  /** Target reading direction. "flip" = invert current; else force target. */
  direction: "flip" | "ltr" | "rtl";
  /** Also swap text_direction vertical⇄horizontal. Default false. */
  text: boolean;
  /** Toggle each image layer's flip_h. Default true. */
  flipImages: boolean;
  /** Swap/sign-flip skews. Default true. */
  skew: boolean;
  /** Mirror tail_angle. Default true. */
  tail: boolean;
  /** Swap align (start⇄end) and anchor_pos left⇄right. Default true. */
  align: boolean;
  /** Skip coordinate mirroring (absolute/relative x). Default false. */
  keepCoords: boolean;
}

export function defaultTransposeOptions(): TransposeOptions {
  return {
    direction: "flip",
    text: false,
    flipImages: true,
    skew: true,
    tail: true,
    align: true,
    keepCoords: false,
  };
}

export interface TransposeResult {
  page: Page;
  warnings: string[];
}

// ── small pure mappers ──────────────────────────────────────────────────────

function flipDirection(d: Direction): Direction {
  return d === "rtl" ? "ltr" : "rtl";
}

/** start⇄end; center unchanged. */
function mirrorAlign(a: Align): Align {
  if (a === "start") return "end";
  if (a === "end") return "start";
  return a;
}

/** Swap the left/right component of an anchor position. */
function mirrorAnchorPos(a: AnchorPos): AnchorPos {
  switch (a) {
    case "top_left":
      return "top_right";
    case "top_right":
      return "top_left";
    case "bottom_left":
      return "bottom_right";
    case "bottom_right":
      return "bottom_left";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return a; // center / top / bottom
  }
}

function flipTextDirection(t: TextDirection): TextDirection {
  return t === "vertical" ? "horizontal" : "vertical";
}

/**
 * Horizontal mirror of a balloon tail angle (degrees). The renderer treats the
 * angle as clockwise-from-up (tail_angle 90 points right, 270 left); a left↔right
 * mirror maps angle → (180 − angle) mod 360, normalized to [0, 360).
 */
function mirrorTailAngle(deg: number): number {
  const m = (180 - deg) % 360;
  return m < 0 ? m + 360 : m;
}

// ── Page ────────────────────────────────────────────────────────────────────

function transposeConfig(cfg: PageConfig, opts: TransposeOptions): PageConfig {
  const next: PageConfig = { ...cfg };
  // direction
  if (opts.direction === "flip") next.direction = flipDirection(cfg.direction);
  else next.direction = opts.direction; // force target (idempotent handled by caller)
  // padding left⇄right (null = fall back to `padding`; swap preserves that)
  next.paddingLeft = cfg.paddingRight;
  next.paddingRight = cfg.paddingLeft;
  return next;
}

/** Whether the requested target differs from the current direction. */
export function directionChanges(cfg: PageConfig, opts: TransposeOptions): boolean {
  if (opts.direction === "flip") return true;
  return cfg.direction !== opts.direction;
}

// ── row / col ───────────────────────────────────────────────────────────────

function transposeContainer<T extends RowNode | ColNode>(node: T, ctx: Ctx): T {
  const { opts } = ctx;
  const next = { ...node } as T;
  if (opts.align) next.align = mirrorAlign(node.align);
  // margin left⇄right
  next.marginLeft = node.marginRight;
  next.marginRight = node.marginLeft;
  if (opts.skew) {
    // swap left/right, sign-flip all (null stays null)
    next.skewLeft = negNullable(node.skewRight);
    next.skewRight = negNullable(node.skewLeft);
    next.skewTop = negNullable(node.skewTop);
    next.skewBottom = negNullable(node.skewBottom);
  }
  next.children = node.children.map((c) => transposeNode(c, ctx));
  return next;
}

function negNullable(v: number | null): number | null {
  return v === null ? null : -v;
}

// ── panel ─────────────────────────────────────────────────────────────────

function transposePanel(node: PanelNode, ctx: Ctx): PanelNode {
  const { opts } = ctx;
  const a = { ...node.attrs };
  // border left⇄right
  [a.borderLeft, a.borderRight] = [node.attrs.borderRight, node.attrs.borderLeft];
  // offset left⇄right
  [a.offsetLeft, a.offsetRight] = [node.attrs.offsetRight, node.attrs.offsetLeft];
  if (opts.skew) {
    a.skewLeft = -node.attrs.skewRight;
    a.skewRight = -node.attrs.skewLeft;
    a.skewTop = -node.attrs.skewTop;
    a.skewBottom = -node.attrs.skewBottom;
  }
  // Only flip the panel's own text_direction when the panel actually has
  // panel-level `text`. Otherwise textDirection is an unused default; flipping
  // it would make serialize emit a spurious `text_direction` line (and the real
  // per-speech flips happen in transposeSpeech).
  if (opts.text && node.attrs.text !== null) {
    a.textDirection = flipTextDirection(node.attrs.textDirection);
  }
  a.imageLayers = node.attrs.imageLayers.map((l) => transposeImageLayer(l, ctx, node.id));
  return { ...node, attrs: a, speeches: node.speeches.map((s) => transposeSpeech(s, ctx)) };
}

// ── image layer ─────────────────────────────────────────────────────────────

function transposeImageLayer(layer: ImageLayer, ctx: Ctx, panelId: string): ImageLayer {
  const { opts } = ctx;
  const next: ImageLayer = { ...layer };
  if (opts.align) next.anchorPos = mirrorAnchorPos(layer.anchorPos);
  if (opts.flipImages) next.flipH = !layer.flipH;
  // dx sign-flip (offset in whatever unit)
  next.dx = negLength(layer.dx);
  if (!opts.keepCoords && layer.x !== null) {
    // Panel-relative x. `%` is resolvable (0..100 space); `mm` needs panel width.
    if (layer.x.unit === "%") {
      const w = layer.width && layer.width.unit === "%" ? layer.width.value : 100;
      next.x = { value: 100 - layer.x.value - w, unit: "%" };
    } else {
      ctx.warn(
        `panel "${panelId}": image layer x is in ${layer.x.unit} (panel-relative); ` +
          `mirroring it needs the panel width (layout-dependent) — kept as-is. ` +
          `Use % for x/width to mirror, or --keep-coords.`,
      );
    }
  }
  return next;
}

function negLength(l: Length): Length {
  return { value: -l.value, unit: l.unit };
}

// ── balloon / monologue ─────────────────────────────────────────────────────

function transposeSpeech(node: SpeechNode, ctx: Ctx): SpeechNode {
  const { opts } = ctx;
  const a: SpeechAttrs = { ...node.attrs };
  if (opts.align) {
    a.align = mirrorAlign(node.attrs.align);
    a.anchorPos = mirrorAnchorPos(node.attrs.anchorPos);
  }
  if (opts.text) a.textDirection = flipTextDirection(node.attrs.textDirection);
  // dx sign-flip (mm)
  a.dx = -node.attrs.dx;
  // Absolute x (page mm) mirror: x' = W − x − width. Needs the page width (ctx)
  // AND an explicit box width. With auto width it's layout-dependent → warn/keep.
  if (!opts.keepCoords && node.attrs.x !== null) {
    if (node.attrs.width !== null) {
      a.x = ctx.pageWidth - node.attrs.x - node.attrs.width;
    } else {
      ctx.warn(
        `${node.kind}${node.id ? ` "${node.id}"` : ""}: absolute x with auto width ` +
          `can't be mirrored without layout — kept as-is. Set an explicit width, or --keep-coords.`,
      );
    }
  }
  if (node.kind === "balloon" && opts.tail) {
    const b = a as BalloonAttrs;
    b.tailAngle = mirrorTailAngle((node.attrs as BalloonAttrs).tailAngle);
  }
  return { ...node, attrs: a } as SpeechNode;
}

// ── dispatch ────────────────────────────────────────────────────────────────

/** Shared read-only context threaded through the recursion. */
interface Ctx {
  opts: TransposeOptions;
  pageWidth: number;
  warn: (m: string) => void;
}

function transposeNode(node: LayoutNode, ctx: Ctx): LayoutNode {
  switch (node.kind) {
    case "panel":
      return transposePanel(node, ctx);
    case "row":
      return transposeContainer(node, ctx);
    case "col":
      return transposeContainer(node, ctx);
  }
}

// ── entry ─────────────────────────────────────────────────────────────────

/**
 * Transpose (mirror left↔right) a parsed page. Returns a new page + warnings.
 * When `opts.direction` names a target the page already has, this is a no-op
 * (returns a clone unchanged) — mirroring twice would wrongly re-flip it.
 */
export function transposePage(page: Page, opts: TransposeOptions): TransposeResult {
  const warnings: string[] = [];
  const ctx: Ctx = {
    opts,
    pageWidth: page.config.widthMm,
    warn: (m: string) => warnings.push(m),
  };

  if (!directionChanges(page.config, opts)) {
    // Already at the requested direction — do nothing (deep clone unchanged).
    return { page: structuredClone(page), warnings };
  }

  const config = transposeConfig(page.config, opts);
  const children = page.children.map((c) => transposeNode(c, ctx));
  return { page: { config, children }, warnings };
}
