/**
 * AST node definitions.
 *
 * Port of manga-gen-python/src/manga_gen/ast.py. The Python side uses Pydantic
 * v2 models with `extra="forbid"`; TS has no runtime type reflection, so:
 *   - each node's shape is a plain interface,
 *   - runtime defaults come from an explicit `defaultXxx()` factory,
 *   - `extra="forbid"` is enforced by `assertKnownKeys` against an
 *     `XXX_KEYS` set at construction time (in parser.ts),
 *   - per-attribute value coercion is driven by the `*_ATTR_TYPES` dispatch
 *     tables, ported verbatim from parser.py's `panel_attr` method.
 *
 * See docs/PORTING_GUIDE.md §4 Stage 2.
 */
export type Unit = "mm" | "px" | "pt" | "%" | "auto";
export type Direction = "rtl" | "ltr";
export type Importance = 1 | 2 | 3;
export type ImageFit = "cover" | "contain" | "fill";
export type TextDirection = "horizontal" | "vertical";
export type Align = "start" | "center" | "end";
export type BalloonShape = "oval" | "shout" | "whisper" | "jagged" | "explosion" | "thought" | "rounded_box";
export type AnchorPos = "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "top" | "bottom" | "left" | "right";
export declare const DIRECTIONS: readonly Direction[];
export declare const IMPORTANCES: readonly Importance[];
export declare const IMAGE_FITS: readonly ImageFit[];
export declare const TEXT_DIRECTIONS: readonly TextDirection[];
export declare const ALIGNS: readonly Align[];
export declare const BALLOON_SHAPES: readonly BalloonShape[];
export declare const ANCHOR_POSITIONS: readonly AnchorPos[];
/** A size value with unit (mm, px, pt, %, or auto). */
export interface Length {
    value: number;
    unit: Unit;
}
export interface PageConfig {
    name: string | null;
    size: string;
    /** unit of the custom size spec */
    sizeUnit: "mm" | "px" | "pt";
    widthMm: number;
    heightMm: number;
    direction: Direction;
    gutter: number;
    gutterColor: string;
    padding: number;
    paddingTop: number | null;
    paddingBottom: number | null;
    paddingLeft: number | null;
    paddingRight: number | null;
    background: string;
    dpi: number;
    border: number;
    borderColor: string;
}
export declare function defaultPageConfig(): PageConfig;
export interface PanelAttrs {
    importance: Importance;
    zIndex: number | null;
    image: string | null;
    imageFit: ImageFit;
    label: string | null;
    text: string | null;
    textDirection: TextDirection;
    border: number;
    borderColor: string;
    borderTop: number | null;
    borderBottom: number | null;
    borderLeft: number | null;
    borderRight: number | null;
    background: string;
    skewLeft: number;
    skewRight: number;
    skewTop: number;
    skewBottom: number;
    offsetTop: number;
    offsetBottom: number;
    offsetLeft: number;
    offsetRight: number;
}
export declare function defaultPanelAttrs(): PanelAttrs;
export interface SpeechAttrs {
    text: string;
    textDirection: TextDirection;
    fontSize: number;
    padding: number;
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
    anchorPos: AnchorPos;
    margin: number;
    dx: number;
    dy: number;
    zIndex: number | null;
    background: string;
    borderColor: string;
    border: number;
    align: Align;
}
export interface BalloonAttrs extends SpeechAttrs {
    shape: BalloonShape;
    aspectRatio: number | null;
    cornerRadius: number;
    innerRatio: number | null;
    jitter: number;
    tailAngle: number;
    tailLength: number;
}
export interface MonologueAttrs extends SpeechAttrs {
    textColor: string;
}
export declare function defaultBalloonAttrs(): BalloonAttrs;
export declare function defaultMonologueAttrs(): MonologueAttrs;
export interface BalloonNode {
    kind: "balloon";
    id: string | null;
    attrs: BalloonAttrs;
}
export interface MonologueNode {
    kind: "monologue";
    id: string | null;
    attrs: MonologueAttrs;
}
export type SpeechNode = BalloonNode | MonologueNode;
export interface PanelNode {
    kind: "panel";
    id: string;
    attrs: PanelAttrs;
    speeches: SpeechNode[];
}
export interface RowNode {
    kind: "row";
    height: Length | null;
    gutter: number | null;
    align: Align;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    skewLeft: number | null;
    skewRight: number | null;
    skewTop: number | null;
    skewBottom: number | null;
    children: LayoutNode[];
}
export interface ColNode {
    kind: "col";
    width: Length | null;
    gutter: number | null;
    align: Align;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    skewLeft: number | null;
    skewRight: number | null;
    skewTop: number | null;
    skewBottom: number | null;
    children: LayoutNode[];
}
/**
 * Layout nodes. balloon/monologue are NOT part of this union — they only ever
 * appear nested inside PanelNode.speeches.
 */
export type LayoutNode = PanelNode | RowNode | ColNode;
export interface Page {
    config: PageConfig;
    children: LayoutNode[];
}
/** Page size definitions (width, height in mm). Ported from parser.py PAGE_SIZES. */
export declare const PAGE_SIZES: Record<string, [number, number]>;
export type AttrValueType = "int" | "float" | "string" | "passthrough";
export declare const PANEL_ATTR_TYPES: Record<string, AttrValueType>;
export declare const PAGE_ATTR_KEYS: ReadonlySet<string>;
export declare const PANEL_ATTR_KEYS: ReadonlySet<string>;
export declare const BALLOON_ATTR_KEYS: ReadonlySet<string>;
export declare const MONOLOGUE_ATTR_KEYS: ReadonlySet<string>;
//# sourceMappingURL=ast.d.ts.map