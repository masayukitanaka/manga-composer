/**
 * Recursive-descent parser: tokens -> Page AST.
 *
 * Port of manga-gen-python/src/manga_gen/parser.py + grammar.lark structural
 * rules. Function names mirror the grammar rules 1:1 for traceability.
 *
 * grammar.lark structure (reference):
 *   page: "page" CNAME? "{" page_body* "}"
 *   page_body: page_attr | statement
 *   statement: row_stmt | col_stmt | panel_stmt
 *   row_stmt: "row" row_attrs? "{" row_body* "}"
 *   col_stmt: "col" col_attrs? "{" col_body* "}"
 *   row_body: row_attr | statement           col_body: col_attr | statement
 *   panel_stmt: "panel" CNAME panel_def?
 *   panel_def: "{" panel_body* "}" | panel_inline_attrs
 *   panel_body: panel_attr | balloon_stmt | monologue_stmt
 *   panel_inline_attrs: panel_attr ("," panel_attr)*
 *   balloon_stmt: "balloon" CNAME? speech_def?
 *   monologue_stmt: "monologue" CNAME? speech_def?
 *   speech_def: "{" panel_attr* "}" | panel_inline_attrs
 *   row_attrs: row_attr ("," row_attr)*   (row_attr: height|gutter|align|margin|skew)
 *   value: NUMBER UNIT? | PERCENTAGE | STRING | CNAME
 *   length_value: NUMBER UNIT | PERCENTAGE
 */

import { tokenize, type Token, type TokenType } from "./lexer.js";
import { ParseError } from "./errors.js";
import {
  type Page,
  type PageConfig,
  type RowNode,
  type ColNode,
  type PanelNode,
  type PanelAttrs,
  type BalloonAttrs,
  type MonologueAttrs,
  type BalloonNode,
  type MonologueNode,
  type SpeechNode,
  type LayoutNode,
  type Length,
  type Align,
  type Direction,
  type Importance,
  type ImageFit,
  type TextDirection,
  type BalloonShape,
  type AnchorPos,
  defaultPageConfig,
  defaultPanelAttrs,
  defaultBalloonAttrs,
  defaultMonologueAttrs,
  PAGE_SIZES,
  PANEL_ATTR_TYPES,
  PAGE_ATTR_KEYS,
  PANEL_ATTR_KEYS,
  BALLOON_ATTR_KEYS,
  MONOLOGUE_ATTR_KEYS,
  DIRECTIONS,
  IMPORTANCES,
  IMAGE_FITS,
  TEXT_DIRECTIONS,
  ALIGNS,
  BALLOON_SHAPES,
  ANCHOR_POSITIONS,
} from "./ast.js";

// ── A parsed DSL value, before per-attribute coercion ───────────────────────
// Mirrors what Lark's `value` rule yields to the transformer: either a raw
// string token payload (NUMBER/PERCENTAGE/STRING/CNAME text) or, for
// `NUMBER UNIT`, a Length. length_value always yields a Length.
type RawValue = { kind: "scalar"; text: string } | { kind: "length"; length: Length };

// ── assertLiteral / assertKnownKeys helpers ─────────────────────────────────

function assertLiteral<T extends string | number>(
  value: string | number,
  allowed: readonly T[],
  field: string,
): T {
  if ((allowed as readonly (string | number)[]).includes(value)) {
    return value as T;
  }
  throw new ParseError(
    `Invalid value for ${field}: ${JSON.stringify(value)} (expected one of ${allowed
      .map((a) => JSON.stringify(a))
      .join(", ")})`,
  );
}

/**
 * extra="forbid" equivalent: reject any raw key not in `allowed`.
 * `context` shapes the error message to match parser.py's wording, e.g.
 * "Unknown page attribute: foo".
 */
function assertKnownKeys(
  raw: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new ParseError(`Unknown ${context} attribute: ${key}`);
    }
  }
}

// ── numeric coercion matching Python semantics ──────────────────────────────

/** Python float(value). */
function toFloat(text: string): number {
  const v = Number(text);
  if (Number.isNaN(v)) throw new ParseError(`Expected a number, got: ${JSON.stringify(text)}`);
  return v;
}

/** Python int(float(value)) — accept "2.0", truncate toward zero. */
function toInt(text: string): number {
  return Math.trunc(toFloat(text));
}

/** Strip a single pair of surrounding double quotes and unescape \" \\ \n. */
function stripString(text: string): string {
  let s = text;
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }
  // Mirror grammar STRING: /"([^"\\]|\\.)*"/ — only \" \\ \n are meaningful.
  return s.replace(/\\(["\\n])/g, (_m, c: string) => (c === "n" ? "\n" : c));
}

// ── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private readonly toks: Token[];
  private pos = 0;
  // Panels that did NOT explicitly set border / border_color, paired with the
  // key they're missing. After page attrs are resolved, page.border /
  // page.border_color are injected into these — mirroring parser.py's
  // panel_stmt, which builds each PanelAttrs with page defaults merged first
  // and any explicit panel attrs overriding. We defer it because a
  // recursive-descent parser reads panels before the page's own attrs.
  private panelsNeedingBorder: PanelNode[] = [];
  private panelsNeedingBorderColor: PanelNode[] = [];

  constructor(source: string) {
    this.toks = tokenize(source);
  }

  private peek(): Token {
    return this.toks[this.pos];
  }

  private at(type: TokenType): boolean {
    return this.toks[this.pos].type === type;
  }

  /** True when the current token is an IDENT with the given text. */
  private atKeyword(word: string): boolean {
    const t = this.toks[this.pos];
    return t.type === "IDENT" && t.value === word;
  }

  private next(): Token {
    return this.toks[this.pos++];
  }

  private expect(type: TokenType): Token {
    const t = this.toks[this.pos];
    if (t.type !== type) {
      throw new ParseError(
        `Expected ${type} but got ${t.type} ${JSON.stringify(t.value)} at line ${t.line}, column ${t.col}`,
      );
    }
    return this.toks[this.pos++];
  }

  private expectKeyword(word: string): Token {
    const t = this.toks[this.pos];
    if (t.type !== "IDENT" || t.value !== word) {
      throw new ParseError(
        `Expected '${word}' but got ${t.type} ${JSON.stringify(t.value)} at line ${t.line}, column ${t.col}`,
      );
    }
    return this.toks[this.pos++];
  }

  // ── value / length_value ──────────────────────────────────────────────

  /** value: NUMBER UNIT? | PERCENTAGE | STRING | CNAME */
  private parseValue(): RawValue {
    const t = this.peek();
    if (t.type === "NUMBER") {
      this.next();
      // Optional unit (mm/px/pt) as a bare IDENT immediately following.
      if (this.atKeyword("mm") || this.atKeyword("px") || this.atKeyword("pt")) {
        const unit = this.next().value as "mm" | "px" | "pt";
        return { kind: "length", length: { value: toFloat(t.value), unit } };
      }
      return { kind: "scalar", text: t.value };
    }
    if (t.type === "PERCENTAGE" || t.type === "STRING" || t.type === "IDENT") {
      this.next();
      return { kind: "scalar", text: t.value };
    }
    throw new ParseError(
      `Expected a value but got ${t.type} ${JSON.stringify(t.value)} at line ${t.line}, column ${t.col}`,
    );
  }

  /** length_value: NUMBER UNIT | PERCENTAGE (used by row height / col width). */
  private parseLengthValue(): Length {
    const t = this.peek();
    if (t.type === "PERCENTAGE") {
      this.next();
      return { value: toFloat(t.value.replace(/%$/, "")), unit: "%" };
    }
    if (t.type === "NUMBER") {
      this.next();
      // grammar requires a UNIT here, but be lenient like value: allow a bare
      // number to mean mm is NOT valid in grammar (length_value: NUMBER UNIT),
      // so require the unit.
      if (this.atKeyword("mm") || this.atKeyword("px") || this.atKeyword("pt")) {
        const unit = this.next().value as "mm" | "px" | "pt";
        return { value: toFloat(t.value), unit };
      }
      throw new ParseError(
        `Expected a unit (mm/px/pt) after ${t.value} at line ${t.line}, column ${t.col}`,
      );
    }
    throw new ParseError(
      `Expected a length value but got ${t.type} ${JSON.stringify(t.value)} at line ${t.line}, column ${t.col}`,
    );
  }

  // ── page ──────────────────────────────────────────────────────────────

  /** page: "page" CNAME? "{" page_body* "}" */
  parsePage(): Page {
    this.expectKeyword("page");
    const config = defaultPageConfig();

    if (this.at("IDENT") && !this.atKeyword("row") && !this.atKeywordLBrace()) {
      // Optional page name (CNAME) before the block. Distinguish from the
      // '{' that opens the body: a name is an IDENT, the block open is LBRACE.
      config.name = this.next().value;
    }

    this.expect("LBRACE");
    const children: LayoutNode[] = [];
    // Accumulate raw page attributes, then validate keys once.
    const rawPageAttrs: Record<string, RawValue> = {};

    while (!this.at("RBRACE") && !this.at("EOF")) {
      if (this.atStatementStart()) {
        children.push(this.parseStatement());
      } else {
        // page_attr: page_attr_key ":" (SIZE_VALUE | value)
        const [key, val] = this.parsePageAttr();
        rawPageAttrs[key] = val;
      }
    }
    this.expect("RBRACE");

    this.applyPageAttrs(config, rawPageAttrs);

    // parser.py merges page border/border_color as each panel's default,
    // overridden by explicit panel attrs. Apply that now that page config is
    // resolved (panels that set their own value are not in these lists).
    for (const p of this.panelsNeedingBorder) p.attrs.border = config.border;
    for (const p of this.panelsNeedingBorderColor) p.attrs.borderColor = config.borderColor;

    return { config, children };
  }

  /** Helper: is the next token '{'? (used to disambiguate the optional name) */
  private atKeywordLBrace(): boolean {
    return this.at("LBRACE");
  }

  private atStatementStart(): boolean {
    return this.atKeyword("row") || this.atKeyword("col") || this.atKeyword("panel");
  }

  /** page_attr: page_attr_key ":" (SIZE_VALUE | value) */
  private parsePageAttr(): [string, RawValue] {
    const keyTok = this.peek();
    if (keyTok.type !== "IDENT") {
      throw new ParseError(
        `Expected a page attribute name but got ${keyTok.type} ${JSON.stringify(keyTok.value)} at line ${keyTok.line}, column ${keyTok.col}`,
      );
    }
    this.next();
    this.expect("COLON");
    if (this.at("SIZE_VALUE")) {
      const t = this.next();
      return [keyTok.value, { kind: "scalar", text: t.value }];
    }
    return [keyTok.value, this.parseValue()];
  }

  private applyPageAttrs(config: PageConfig, raw: Record<string, RawValue>): void {
    assertKnownKeys(raw, PAGE_ATTR_KEYS, "page");
    for (const [name, val] of Object.entries(raw)) {
      const text = val.kind === "scalar" ? val.text : String(val.length.value);
      switch (name) {
        case "size":
          this.applySize(config, text);
          break;
        case "direction":
          config.direction = assertLiteral<Direction>(
            text,
            DIRECTIONS,
            "direction",
          );
          break;
        case "gutter":
          config.gutter = toFloat(text);
          break;
        case "padding":
          config.padding = toFloat(text);
          break;
        case "padding_top":
          config.paddingTop = toFloat(text);
          break;
        case "padding_bottom":
          config.paddingBottom = toFloat(text);
          break;
        case "padding_left":
          config.paddingLeft = toFloat(text);
          break;
        case "padding_right":
          config.paddingRight = toFloat(text);
          break;
        case "background":
          config.background = stripString(text);
          break;
        case "gutter_color":
          config.gutterColor = stripString(text);
          break;
        case "dpi":
          config.dpi = toInt(text);
          break;
        case "border":
          config.border = toFloat(text);
          break;
        case "border_color":
          config.borderColor = stripString(text);
          break;
        default:
          // Unreachable: assertKnownKeys already validated the key set.
          throw new ParseError(`Unknown page attribute: ${name}`);
      }
    }
  }

  private applySize(config: PageConfig, valueStr: string): void {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm|px|pt)?$/.exec(valueStr);
    if (m) {
      const w = toFloat(m[1]);
      const h = toFloat(m[2]);
      const unit = (m[3] ?? "mm") as "mm" | "px" | "pt";
      config.size = valueStr;
      config.sizeUnit = unit;
      // Always convert to mm for layout calculations.
      const factor = unit === "mm" ? 1.0 : unit === "px" ? 25.4 / 96 : 25.4 / 72;
      config.widthMm = w * factor;
      config.heightMm = h * factor;
    } else if (valueStr in PAGE_SIZES) {
      const [width, height] = PAGE_SIZES[valueStr];
      config.size = valueStr;
      config.sizeUnit = "mm";
      config.widthMm = width;
      config.heightMm = height;
    } else {
      throw new ParseError(`Unknown page size: ${valueStr}`);
    }
  }

  // ── statement / row / col / panel ─────────────────────────────────────

  /** statement: row_stmt | col_stmt | panel_stmt */
  private parseStatement(): LayoutNode {
    if (this.atKeyword("row")) return this.parseRowStmt();
    if (this.atKeyword("col")) return this.parseColStmt();
    if (this.atKeyword("panel")) return this.parsePanelStmt();
    const t = this.peek();
    throw new ParseError(
      `Expected row, col, or panel but got ${t.type} ${JSON.stringify(t.value)} at line ${t.line}, column ${t.col}`,
    );
  }

  /** row_stmt: "row" row_attrs? "{" row_body* "}" */
  private parseRowStmt(): RowNode {
    this.expectKeyword("row");
    const node: RowNode = {
      kind: "row",
      height: null,
      gutter: null,
      align: "start",
      marginTop: 0.0,
      marginBottom: 0.0,
      marginLeft: 0.0,
      marginRight: 0.0,
      skewLeft: null,
      skewRight: null,
      skewTop: null,
      skewBottom: null,
      children: [],
    };

    // Optional row_attrs (comma-separated) before the block.
    if (!this.at("LBRACE")) {
      this.parseContainerAttrs(node, "row");
    }

    this.expect("LBRACE");
    while (!this.at("RBRACE") && !this.at("EOF")) {
      if (this.atStatementStart()) {
        node.children.push(this.parseStatement());
      } else {
        // row_body: row_attr | statement — attrs may also appear inside the
        // block (e.g. `row { skew_bottom: 8 panel x {} }` in jujutsu.manga).
        this.parseOneContainerAttr(node, "row");
      }
    }
    this.expect("RBRACE");
    return node;
  }

  /** col_stmt: "col" col_attrs? "{" col_body* "}" */
  private parseColStmt(): ColNode {
    this.expectKeyword("col");
    const node: ColNode = {
      kind: "col",
      width: null,
      gutter: null,
      align: "start",
      marginTop: 0.0,
      marginBottom: 0.0,
      marginLeft: 0.0,
      marginRight: 0.0,
      skewLeft: null,
      skewRight: null,
      skewTop: null,
      skewBottom: null,
      children: [],
    };

    if (!this.at("LBRACE")) {
      this.parseContainerAttrs(node, "col");
    }

    this.expect("LBRACE");
    while (!this.at("RBRACE") && !this.at("EOF")) {
      if (this.atStatementStart()) {
        node.children.push(this.parseStatement());
      } else {
        this.parseOneContainerAttr(node, "col");
      }
    }
    this.expect("RBRACE");
    return node;
  }

  /** row_attrs / col_attrs: attr ("," attr)*  (before the block) */
  private parseContainerAttrs(node: RowNode | ColNode, kind: "row" | "col"): void {
    this.parseOneContainerAttr(node, kind);
    while (this.at("COMMA")) {
      this.next();
      this.parseOneContainerAttr(node, kind);
    }
  }

  /**
   * One row_attr / col_attr:
   *   row_height: "height" ":" length_value    (row only)
   *   col_width:  "width"  ":" length_value    (col only)
   *   *_gutter:   "gutter" ":" NUMBER
   *   *_align:    "align"  ":" CNAME
   *   *_margin:   margin_top/bottom/left/right ":" NUMBER
   *   *_skew:     skew_left/right/top/bottom   ":" NUMBER
   */
  private parseOneContainerAttr(node: RowNode | ColNode, kind: "row" | "col"): void {
    const keyTok = this.peek();
    if (keyTok.type !== "IDENT") {
      throw new ParseError(
        `Expected a ${kind} attribute name but got ${keyTok.type} ${JSON.stringify(keyTok.value)} at line ${keyTok.line}, column ${keyTok.col}`,
      );
    }
    const key = keyTok.value;
    this.next();
    this.expect("COLON");

    if (key === "height") {
      if (kind !== "row") throw new ParseError(`'height' is only valid on row`);
      (node as RowNode).height = this.parseLengthValue();
      return;
    }
    if (key === "width") {
      if (kind !== "col") throw new ParseError(`'width' is only valid on col`);
      (node as ColNode).width = this.parseLengthValue();
      return;
    }
    if (key === "gutter") {
      node.gutter = toFloat(this.expect("NUMBER").value);
      return;
    }
    if (key === "align") {
      node.align = assertLiteral<Align>(this.expect("IDENT").value, ALIGNS, `${kind} align`);
      return;
    }
    if (key === "margin_top" || key === "margin_bottom" || key === "margin_left" || key === "margin_right") {
      const v = toFloat(this.expect("NUMBER").value);
      if (key === "margin_top") node.marginTop = v;
      else if (key === "margin_bottom") node.marginBottom = v;
      else if (key === "margin_left") node.marginLeft = v;
      else node.marginRight = v;
      return;
    }
    if (key === "skew_left" || key === "skew_right" || key === "skew_top" || key === "skew_bottom") {
      const v = toFloat(this.expect("NUMBER").value);
      if (key === "skew_left") node.skewLeft = v;
      else if (key === "skew_right") node.skewRight = v;
      else if (key === "skew_top") node.skewTop = v;
      else node.skewBottom = v;
      return;
    }
    throw new ParseError(`Unknown ${kind} attribute: ${key}`);
  }

  /** panel_stmt: "panel" CNAME panel_def? */
  private parsePanelStmt(): PanelNode {
    this.expectKeyword("panel");
    const idTok = this.expect("IDENT");
    const panelId = idTok.value;

    let rawAttrs: Record<string, RawValue> = {};
    let speeches: SpeechNode[] = [];

    if (this.at("LBRACE")) {
      // Block form: "{" panel_body* "}"
      [rawAttrs, speeches] = this.parsePanelDefBlock();
    } else if (this.atPanelInlineStart()) {
      // Inline form: panel_inline_attrs
      rawAttrs = this.parsePanelInlineAttrs();
    }
    // else: minimal form `panel foo` with no def.

    const attrs = this.buildPanelAttrs(rawAttrs);
    const node: PanelNode = { kind: "panel", id: panelId, attrs, speeches };

    // Register for the page-default border/border_color merge (see parsePage)
    // unless this panel set them explicitly.
    if (!("border" in rawAttrs)) this.panelsNeedingBorder.push(node);
    if (!("border_color" in rawAttrs)) this.panelsNeedingBorderColor.push(node);

    return node;
  }

  /**
   * Is the token stream at the start of an inline panel attr list?
   * Inline form is `panel foo key: value, ...` — so an IDENT followed by ':'.
   * Guard against consuming the next statement's `row`/`col`/`panel` keyword.
   */
  private atPanelInlineStart(): boolean {
    return (
      this.at("IDENT") &&
      this.toks[this.pos + 1]?.type === "COLON" &&
      !this.atStatementStart()
    );
  }

  /** panel_def block form: "{" panel_body* "}" -> (raw attrs, speeches) */
  private parsePanelDefBlock(): [Record<string, RawValue>, SpeechNode[]] {
    this.expect("LBRACE");
    const attrs: Record<string, RawValue> = {};
    const speeches: SpeechNode[] = [];
    while (!this.at("RBRACE") && !this.at("EOF")) {
      // panel_body: panel_attr | balloon_stmt | monologue_stmt
      if (this.atKeyword("balloon")) {
        speeches.push(this.parseBalloonStmt());
      } else if (this.atKeyword("monologue")) {
        speeches.push(this.parseMonologueStmt());
      } else {
        const [key, val] = this.parsePanelAttr();
        attrs[key] = val;
      }
    }
    this.expect("RBRACE");
    return [attrs, speeches];
  }

  /** panel_inline_attrs: panel_attr ("," panel_attr)* */
  private parsePanelInlineAttrs(): Record<string, RawValue> {
    const attrs: Record<string, RawValue> = {};
    const [k, v] = this.parsePanelAttr();
    attrs[k] = v;
    while (this.at("COMMA")) {
      this.next();
      const [k2, v2] = this.parsePanelAttr();
      attrs[k2] = v2;
    }
    return attrs;
  }

  /** panel_attr: panel_attr_key ":" value */
  private parsePanelAttr(): [string, RawValue] {
    const keyTok = this.peek();
    if (keyTok.type !== "IDENT") {
      throw new ParseError(
        `Expected an attribute name but got ${keyTok.type} ${JSON.stringify(keyTok.value)} at line ${keyTok.line}, column ${keyTok.col}`,
      );
    }
    this.next();
    this.expect("COLON");
    return [keyTok.value, this.parseValue()];
  }

  // ── balloon / monologue ───────────────────────────────────────────────

  /** balloon_stmt: "balloon" CNAME? speech_def? */
  private parseBalloonStmt(): BalloonNode {
    this.expectKeyword("balloon");
    const id = this.maybeSpeechId();
    const raw = this.maybeSpeechDef();
    const attrs = this.buildBalloonAttrs(raw);
    return { kind: "balloon", id, attrs };
  }

  /** monologue_stmt: "monologue" CNAME? speech_def? */
  private parseMonologueStmt(): MonologueNode {
    this.expectKeyword("monologue");
    const id = this.maybeSpeechId();
    const raw = this.maybeSpeechDef();
    const attrs = this.buildMonologueAttrs(raw);
    return { kind: "monologue", id, attrs };
  }

  /** Optional speech id: a CNAME that is NOT the start of a def or attr. */
  private maybeSpeechId(): string | null {
    // An id is a bare IDENT not immediately followed by ':' and not '{'.
    if (this.at("IDENT") && this.toks[this.pos + 1]?.type !== "COLON") {
      return this.next().value;
    }
    return null;
  }

  /** speech_def: "{" panel_attr* "}" | panel_inline_attrs (both optional). */
  private maybeSpeechDef(): Record<string, RawValue> {
    if (this.at("LBRACE")) {
      this.expect("LBRACE");
      const attrs: Record<string, RawValue> = {};
      while (!this.at("RBRACE") && !this.at("EOF")) {
        const [k, v] = this.parsePanelAttr();
        attrs[k] = v;
      }
      this.expect("RBRACE");
      return attrs;
    }
    if (this.atPanelInlineStart()) {
      return this.parsePanelInlineAttrs();
    }
    return {};
  }

  // ── attr builders (coercion + validation) ─────────────────────────────

  private coerceScalar(name: string, val: RawValue): number | string {
    const type = PANEL_ATTR_TYPES[name];
    const text = val.kind === "scalar" ? val.text : String(val.length.value);
    if (type === "int") return toInt(text);
    if (type === "float") return toFloat(text);
    if (type === "string") return stripString(text);
    // passthrough (enum) or unknown-but-allowed: keep as raw string.
    return text;
  }

  private buildPanelAttrs(raw: Record<string, RawValue>): PanelAttrs {
    assertKnownKeys(raw, PANEL_ATTR_KEYS, "panel");
    const attrs = defaultPanelAttrs();
    for (const [name, val] of Object.entries(raw)) {
      const v = this.coerceScalar(name, val);
      switch (name) {
        case "importance":
          attrs.importance = assertLiteral<Importance>(v as number, IMPORTANCES, "importance");
          break;
        case "z_index":
          attrs.zIndex = v as number;
          break;
        case "image":
          attrs.image = v as string;
          break;
        case "image_fit":
          attrs.imageFit = assertLiteral<ImageFit>(v as string, IMAGE_FITS, "image_fit");
          break;
        case "label":
          attrs.label = v as string;
          break;
        case "text":
          attrs.text = v as string;
          break;
        case "text_direction":
          attrs.textDirection = assertLiteral<TextDirection>(
            v as string,
            TEXT_DIRECTIONS,
            "text_direction",
          );
          break;
        case "border":
          attrs.border = v as number;
          break;
        case "border_color":
          attrs.borderColor = v as string;
          break;
        case "border_top":
          attrs.borderTop = v as number;
          break;
        case "border_bottom":
          attrs.borderBottom = v as number;
          break;
        case "border_left":
          attrs.borderLeft = v as number;
          break;
        case "border_right":
          attrs.borderRight = v as number;
          break;
        case "background":
          attrs.background = v as string;
          break;
        case "skew_left":
          attrs.skewLeft = v as number;
          break;
        case "skew_right":
          attrs.skewRight = v as number;
          break;
        case "skew_top":
          attrs.skewTop = v as number;
          break;
        case "skew_bottom":
          attrs.skewBottom = v as number;
          break;
        case "offset_top":
          attrs.offsetTop = v as number;
          break;
        case "offset_bottom":
          attrs.offsetBottom = v as number;
          break;
        case "offset_left":
          attrs.offsetLeft = v as number;
          break;
        case "offset_right":
          attrs.offsetRight = v as number;
          break;
        default:
          throw new ParseError(`Unknown panel attribute: ${name}`);
      }
    }
    return attrs;
  }

  private applySpeechShared(
    attrs: BalloonAttrs | MonologueAttrs,
    name: string,
    v: number | string,
  ): boolean {
    switch (name) {
      case "text":
        attrs.text = v as string;
        return true;
      case "text_direction":
        attrs.textDirection = assertLiteral<TextDirection>(
          v as string,
          TEXT_DIRECTIONS,
          "text_direction",
        );
        return true;
      case "font_size":
        attrs.fontSize = v as number;
        return true;
      case "padding":
        attrs.padding = v as number;
        return true;
      case "x":
        attrs.x = v as number;
        return true;
      case "y":
        attrs.y = v as number;
        return true;
      case "width":
        attrs.width = v as number;
        return true;
      case "height":
        attrs.height = v as number;
        return true;
      case "anchor_pos":
        attrs.anchorPos = assertLiteral<AnchorPos>(v as string, ANCHOR_POSITIONS, "anchor_pos");
        return true;
      case "margin":
        attrs.margin = v as number;
        return true;
      case "dx":
        attrs.dx = v as number;
        return true;
      case "dy":
        attrs.dy = v as number;
        return true;
      case "z_index":
        attrs.zIndex = v as number;
        return true;
      case "background":
        attrs.background = v as string;
        return true;
      case "border_color":
        attrs.borderColor = v as string;
        return true;
      case "border":
        attrs.border = v as number;
        return true;
      case "align":
        attrs.align = assertLiteral<Align>(v as string, ALIGNS, "align");
        return true;
      default:
        return false;
    }
  }

  private buildBalloonAttrs(raw: Record<string, RawValue>): BalloonAttrs {
    assertKnownKeys(raw, BALLOON_ATTR_KEYS, "balloon");
    const attrs = defaultBalloonAttrs();
    for (const [name, val] of Object.entries(raw)) {
      const v = this.coerceScalar(name, val);
      if (this.applySpeechShared(attrs, name, v)) continue;
      switch (name) {
        case "shape":
          attrs.shape = assertLiteral<BalloonShape>(v as string, BALLOON_SHAPES, "shape");
          break;
        case "aspect_ratio":
          attrs.aspectRatio = v as number;
          break;
        case "corner_radius":
          attrs.cornerRadius = v as number;
          break;
        case "inner_ratio":
          attrs.innerRatio = v as number;
          break;
        case "jitter":
          attrs.jitter = v as number;
          break;
        case "tail_angle":
          attrs.tailAngle = v as number;
          break;
        case "tail_length":
          attrs.tailLength = v as number;
          break;
        default:
          throw new ParseError(`Unknown balloon attribute: ${name}`);
      }
    }
    return attrs;
  }

  private buildMonologueAttrs(raw: Record<string, RawValue>): MonologueAttrs {
    assertKnownKeys(raw, MONOLOGUE_ATTR_KEYS, "monologue");
    const attrs = defaultMonologueAttrs();
    for (const [name, val] of Object.entries(raw)) {
      const v = this.coerceScalar(name, val);
      if (this.applySpeechShared(attrs, name, v)) continue;
      switch (name) {
        case "text_color":
          attrs.textColor = v as string;
          break;
        default:
          throw new ParseError(`Unknown monologue attribute: ${name}`);
      }
    }
    return attrs;
  }
}

/**
 * Parse DSL source code and return the Page AST.
 * @throws ParseError on any syntax or validation error.
 */
export function parse(source: string): Page {
  const parser = new Parser(source);
  const page = parser.parsePage();
  return page;
}
