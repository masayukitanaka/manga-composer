/**
 * AST → .manga source serializer (the inverse of parse()).
 *
 * `parse()` normalizes everything and materializes defaults, so a faithful
 * "write back exactly what the user typed" is impossible (docs/SPEC.md §3). This
 * serializer instead emits a canonical .manga document that RE-PARSES to an
 * equivalent AST: only attributes that differ from their defaults are written,
 * using the DSL's snake_case attribute names.
 *
 * Round-trip guarantee (covered by test/unit/serialize.test.ts):
 *   parse(serialize(parse(src)))  deep-equals  parse(src)
 *
 * Note on page border/border_color: parse() folds the page-level `border` /
 * `border_color` into every panel as its default. To keep the round-trip exact
 * we compare each panel's border against the PAGE's resolved border (not the
 * hard-coded panel default), so a panel that merely inherited the page value is
 * not re-emitted as an explicit attribute.
 */

import {
  type Page,
  type PageConfig,
  type PanelNode,
  type RowNode,
  type ColNode,
  type LayoutNode,
  type SpeechNode,
  type BalloonNode,
  type MonologueNode,
  type Length,
  type PanelAttrs,
  defaultPageConfig,
  defaultPanelAttrs,
  defaultBalloonAttrs,
  defaultMonologueAttrs,
} from "./ast.js";

const INDENT = "  ";

/** Serialize a parsed Page back to canonical .manga source text. */
export function serialize(page: Page): string {
  const lines: string[] = [];
  const header = pageHeader(page.config);
  lines.push(header ? `page ${header}{` : "page {");

  const attrLines = pageAttrLines(page.config);
  for (const a of attrLines) lines.push(INDENT + a);
  if (attrLines.length && page.children.length) lines.push("");

  for (let i = 0; i < page.children.length; i++) {
    emitNode(page.children[i], 1, page.config, lines);
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

// ── Page ────────────────────────────────────────────────────────────────────

/** Returns "name " if the page has a name, else "" (space included for spacing). */
function pageHeader(cfg: PageConfig): string {
  return cfg.name ? `${cfg.name} ` : "";
}

function pageAttrLines(cfg: PageConfig): string[] {
  const d = defaultPageConfig();
  const out: string[] = [];

  // size: only emit if not the default A4. `size` holds the original spec
  // string ("B5", "150x200", etc.), which is exactly what parse() expects.
  if (cfg.size !== d.size) out.push(`size: ${cfg.size}`);
  if (cfg.direction !== d.direction) out.push(`direction: ${cfg.direction}`);
  if (cfg.gutter !== d.gutter) out.push(`gutter: ${num(cfg.gutter)}`);
  if (cfg.padding !== d.padding) out.push(`padding: ${num(cfg.padding)}`);
  if (cfg.paddingTop !== d.paddingTop) out.push(`padding_top: ${num(cfg.paddingTop!)}`);
  if (cfg.paddingBottom !== d.paddingBottom) out.push(`padding_bottom: ${num(cfg.paddingBottom!)}`);
  if (cfg.paddingLeft !== d.paddingLeft) out.push(`padding_left: ${num(cfg.paddingLeft!)}`);
  if (cfg.paddingRight !== d.paddingRight) out.push(`padding_right: ${num(cfg.paddingRight!)}`);
  if (cfg.background !== d.background) out.push(`background: ${str(cfg.background)}`);
  if (cfg.gutterColor !== d.gutterColor) out.push(`gutter_color: ${str(cfg.gutterColor)}`);
  if (cfg.dpi !== d.dpi) out.push(`dpi: ${cfg.dpi}`);
  if (cfg.border !== d.border) out.push(`border: ${num(cfg.border)}`);
  if (cfg.borderColor !== d.borderColor) out.push(`border_color: ${str(cfg.borderColor)}`);

  return out;
}

// ── Layout nodes ─────────────────────────────────────────────────────────────

function emitNode(node: LayoutNode, depth: number, cfg: PageConfig, lines: string[]): void {
  switch (node.kind) {
    case "panel":
      emitPanel(node, depth, cfg, lines);
      break;
    case "row":
      emitContainer(node, "row", depth, cfg, lines);
      break;
    case "col":
      emitContainer(node, "col", depth, cfg, lines);
      break;
  }
}

function emitContainer(
  node: RowNode | ColNode,
  kind: "row" | "col",
  depth: number,
  cfg: PageConfig,
  lines: string[],
): void {
  const pad = INDENT.repeat(depth);
  const attrs = containerAttrs(node, kind);
  const head = attrs.length ? `${kind} ${attrs.join(", ")} {` : `${kind} {`;
  lines.push(pad + head);
  for (const child of node.children) emitNode(child, depth + 1, cfg, lines);
  lines.push(pad + "}");
}

/** Container inline attrs, in the order the grammar documents them. */
function containerAttrs(node: RowNode | ColNode, kind: "row" | "col"): string[] {
  const out: string[] = [];

  if (kind === "row") {
    const h = (node as RowNode).height;
    if (h) out.push(`height: ${length(h)}`);
  } else {
    const w = (node as ColNode).width;
    if (w) out.push(`width: ${length(w)}`);
  }

  if (node.gutter !== null) out.push(`gutter: ${num(node.gutter)}`);
  if (node.align !== "start") out.push(`align: ${node.align}`);
  if (node.marginTop !== 0) out.push(`margin_top: ${num(node.marginTop)}`);
  if (node.marginBottom !== 0) out.push(`margin_bottom: ${num(node.marginBottom)}`);
  if (node.marginLeft !== 0) out.push(`margin_left: ${num(node.marginLeft)}`);
  if (node.marginRight !== 0) out.push(`margin_right: ${num(node.marginRight)}`);
  if (node.skewLeft !== null) out.push(`skew_left: ${num(node.skewLeft)}`);
  if (node.skewRight !== null) out.push(`skew_right: ${num(node.skewRight)}`);
  if (node.skewTop !== null) out.push(`skew_top: ${num(node.skewTop)}`);
  if (node.skewBottom !== null) out.push(`skew_bottom: ${num(node.skewBottom)}`);

  return out;
}

// ── Panel ────────────────────────────────────────────────────────────────────

function emitPanel(node: PanelNode, depth: number, cfg: PageConfig, lines: string[]): void {
  const pad = INDENT.repeat(depth);
  const attrs = panelAttrLines(node.attrs, cfg);

  if (attrs.length === 0 && node.speeches.length === 0) {
    // Minimal form: `panel id`
    lines.push(`${pad}panel ${node.id}`);
    return;
  }

  lines.push(`${pad}panel ${node.id} {`);
  for (const a of attrs) lines.push(pad + INDENT + a);
  for (const sp of node.speeches) emitSpeech(sp, depth + 1, lines);
  lines.push(pad + "}");
}

function panelAttrLines(a: PanelAttrs, cfg: PageConfig): string[] {
  const d = defaultPanelAttrs();
  // parse() overrides the panel border/borderColor default with the page value.
  const borderDefault = cfg.border;
  const borderColorDefault = cfg.borderColor;
  const out: string[] = [];

  if (a.importance !== d.importance) out.push(`importance: ${a.importance}`);
  if (a.zIndex !== d.zIndex) out.push(`z_index: ${a.zIndex}`);
  if (a.image !== d.image) out.push(`image: ${str(a.image!)}`);
  if (a.imageFit !== d.imageFit) out.push(`image_fit: ${a.imageFit}`);
  if (a.label !== d.label) out.push(`label: ${str(a.label!)}`);
  if (a.text !== d.text) out.push(`text: ${str(a.text!)}`);
  if (a.textDirection !== d.textDirection) out.push(`text_direction: ${a.textDirection}`);
  if (a.border !== borderDefault) out.push(`border: ${num(a.border)}`);
  if (a.borderColor !== borderColorDefault) out.push(`border_color: ${str(a.borderColor)}`);
  if (a.borderTop !== d.borderTop) out.push(`border_top: ${num(a.borderTop!)}`);
  if (a.borderBottom !== d.borderBottom) out.push(`border_bottom: ${num(a.borderBottom!)}`);
  if (a.borderLeft !== d.borderLeft) out.push(`border_left: ${num(a.borderLeft!)}`);
  if (a.borderRight !== d.borderRight) out.push(`border_right: ${num(a.borderRight!)}`);
  if (a.background !== d.background) out.push(`background: ${str(a.background)}`);
  if (a.skewLeft !== d.skewLeft) out.push(`skew_left: ${num(a.skewLeft)}`);
  if (a.skewRight !== d.skewRight) out.push(`skew_right: ${num(a.skewRight)}`);
  if (a.skewTop !== d.skewTop) out.push(`skew_top: ${num(a.skewTop)}`);
  if (a.skewBottom !== d.skewBottom) out.push(`skew_bottom: ${num(a.skewBottom)}`);
  if (a.offsetTop !== d.offsetTop) out.push(`offset_top: ${num(a.offsetTop)}`);
  if (a.offsetBottom !== d.offsetBottom) out.push(`offset_bottom: ${num(a.offsetBottom)}`);
  if (a.offsetLeft !== d.offsetLeft) out.push(`offset_left: ${num(a.offsetLeft)}`);
  if (a.offsetRight !== d.offsetRight) out.push(`offset_right: ${num(a.offsetRight)}`);

  return out;
}

// ── Speech (balloon / monologue) ─────────────────────────────────────────────

function emitSpeech(node: SpeechNode, depth: number, lines: string[]): void {
  const pad = INDENT.repeat(depth);
  const id = node.id ? `${node.id} ` : "";
  const attrs =
    node.kind === "balloon" ? balloonAttrLines(node) : monologueAttrLines(node);
  lines.push(`${pad}${node.kind} ${id}{`);
  for (const a of attrs) lines.push(pad + INDENT + a);
  lines.push(pad + "}");
}

/** Shared SpeechAttrs lines, comparing against a kind-specific default object. */
function speechSharedLines(a: BalloonNode["attrs"] | MonologueNode["attrs"], d: BalloonNode["attrs"] | MonologueNode["attrs"]): string[] {
  const out: string[] = [];
  if (a.text !== d.text) out.push(`text: ${str(a.text)}`);
  if (a.textDirection !== d.textDirection) out.push(`text_direction: ${a.textDirection}`);
  if (a.fontSize !== d.fontSize) out.push(`font_size: ${num(a.fontSize)}`);
  if (a.padding !== d.padding) out.push(`padding: ${num(a.padding)}`);
  if (a.x !== d.x) out.push(`x: ${num(a.x!)}`);
  if (a.y !== d.y) out.push(`y: ${num(a.y!)}`);
  if (a.width !== d.width) out.push(`width: ${num(a.width!)}`);
  if (a.height !== d.height) out.push(`height: ${num(a.height!)}`);
  if (a.anchorPos !== d.anchorPos) out.push(`anchor_pos: ${a.anchorPos}`);
  if (a.margin !== d.margin) out.push(`margin: ${num(a.margin)}`);
  if (a.dx !== d.dx) out.push(`dx: ${num(a.dx)}`);
  if (a.dy !== d.dy) out.push(`dy: ${num(a.dy)}`);
  if (a.zIndex !== d.zIndex) out.push(`z_index: ${a.zIndex}`);
  if (a.background !== d.background) out.push(`background: ${str(a.background)}`);
  if (a.borderColor !== d.borderColor) out.push(`border_color: ${str(a.borderColor)}`);
  if (a.border !== d.border) out.push(`border: ${num(a.border)}`);
  if (a.align !== d.align) out.push(`align: ${a.align}`);
  return out;
}

function balloonAttrLines(node: BalloonNode): string[] {
  const a = node.attrs;
  const d = defaultBalloonAttrs();
  const out = speechSharedLines(a, d);
  if (a.shape !== d.shape) out.push(`shape: ${a.shape}`);
  if (a.aspectRatio !== d.aspectRatio) out.push(`aspect_ratio: ${num(a.aspectRatio!)}`);
  if (a.cornerRadius !== d.cornerRadius) out.push(`corner_radius: ${num(a.cornerRadius)}`);
  if (a.innerRatio !== d.innerRatio) out.push(`inner_ratio: ${num(a.innerRatio!)}`);
  if (a.jitter !== d.jitter) out.push(`jitter: ${num(a.jitter)}`);
  if (a.tailAngle !== d.tailAngle) out.push(`tail_angle: ${num(a.tailAngle)}`);
  if (a.tailLength !== d.tailLength) out.push(`tail_length: ${num(a.tailLength)}`);
  return out;
}

function monologueAttrLines(node: MonologueNode): string[] {
  const a = node.attrs;
  const d = defaultMonologueAttrs();
  const out = speechSharedLines(a, d);
  if (a.textColor !== d.textColor) out.push(`text_color: ${str(a.textColor)}`);
  return out;
}

// ── Value formatters ─────────────────────────────────────────────────────────

/** Format a number for the DSL. String() already drops trailing ".0". */
function num(n: number): string {
  return String(n);
}

/** Quote a string value the way the DSL expects (double quotes, escaped). */
function str(s: string): string {
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

/** Format a Length as the DSL writes it: `40%` or `60mm` etc. */
function length(l: Length): string {
  if (l.unit === "%") return `${num(l.value)}%`;
  if (l.unit === "auto") return "auto";
  return `${num(l.value)}${l.unit}`;
}
