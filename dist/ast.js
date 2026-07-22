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
// Runtime lists mirroring the literal unions above, for assertLiteral().
export const DIRECTIONS = ["rtl", "ltr"];
export const IMPORTANCES = [1, 2, 3];
export const IMAGE_FITS = ["cover", "contain", "fill"];
export const TEXT_DIRECTIONS = ["horizontal", "vertical"];
export const ALIGNS = ["start", "center", "end"];
export const BALLOON_SHAPES = [
    "oval",
    "shout",
    "whisper",
    "jagged",
    "explosion",
    "thought",
    "rounded_box",
];
export const ANCHOR_POSITIONS = [
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "center",
    "top",
    "bottom",
    "left",
    "right",
];
export function defaultPageConfig() {
    return {
        name: null,
        size: "A4",
        sizeUnit: "mm",
        widthMm: 210.0,
        heightMm: 297.0,
        direction: "ltr",
        gutter: 5.0,
        gutterColor: "#ffffff",
        padding: 10.0,
        paddingTop: null,
        paddingBottom: null,
        paddingLeft: null,
        paddingRight: null,
        background: "#ffffff",
        dpi: 300,
        border: 1.0,
        borderColor: "#000000",
    };
}
export function defaultPanelAttrs() {
    return {
        importance: 2,
        zIndex: null,
        image: null,
        imageFit: "cover",
        label: null,
        text: null,
        textDirection: "horizontal",
        border: 1.0,
        borderColor: "#000000",
        borderTop: null,
        borderBottom: null,
        borderLeft: null,
        borderRight: null,
        background: "#ffffff",
        skewLeft: 0.0,
        skewRight: 0.0,
        skewTop: 0.0,
        skewBottom: 0.0,
        offsetTop: 0.0,
        offsetBottom: 0.0,
        offsetLeft: 0.0,
        offsetRight: 0.0,
    };
}
function defaultSpeechAttrs() {
    return {
        text: "",
        textDirection: "horizontal",
        fontSize: 4.5,
        padding: 1.5,
        x: null,
        y: null,
        width: null,
        height: null,
        anchorPos: "top_right",
        margin: 3.0,
        dx: 0.0,
        dy: 0.0,
        zIndex: null,
        background: "#ffffff",
        borderColor: "#000000",
        border: 0.45,
        align: "start",
    };
}
export function defaultBalloonAttrs() {
    return {
        ...defaultSpeechAttrs(),
        shape: "oval",
        aspectRatio: null,
        cornerRadius: 3.0,
        innerRatio: null,
        jitter: 1.0,
        tailAngle: 270.0,
        tailLength: 5.6,
    };
}
export function defaultMonologueAttrs() {
    return {
        ...defaultSpeechAttrs(),
        // monologue-specific overrides (ast.py MonologueAttrs)
        background: "transparent",
        border: 0.0,
        textColor: "#000000",
    };
}
// ── Page size table ─────────────────────────────────────────────────────────
/** Page size definitions (width, height in mm). Ported from parser.py PAGE_SIZES. */
export const PAGE_SIZES = {
    A3: [297.0, 420.0],
    A4: [210.0, 297.0],
    B4: [257.0, 364.0],
    B5: [182.0, 257.0],
};
export const PANEL_ATTR_TYPES = {
    // int: int(float(value))
    importance: "int",
    z_index: "int",
    // float
    border: "float",
    skew_left: "float",
    skew_right: "float",
    skew_top: "float",
    skew_bottom: "float",
    offset_top: "float",
    offset_bottom: "float",
    offset_left: "float",
    offset_right: "float",
    border_top: "float",
    border_bottom: "float",
    border_left: "float",
    border_right: "float",
    font_size: "float",
    x: "float",
    y: "float",
    width: "float",
    height: "float",
    dx: "float",
    dy: "float",
    margin: "float",
    tail_length: "float",
    tail_angle: "float",
    aspect_ratio: "float",
    corner_radius: "float",
    padding: "float",
    inner_ratio: "float",
    jitter: "float",
    // string: str(value).strip('"')
    image: "string",
    text: "string",
    label: "string",
    border_color: "string",
    background: "string",
    shape: "string",
    text_color: "string",
    // passthrough (enum): str(value)
    image_fit: "passthrough",
    text_direction: "passthrough",
    anchor_pos: "passthrough",
    align: "passthrough",
};
// ── Allowed-key sets (extra="forbid" equivalent) ────────────────────────────
//
// Snake_case DSL attribute keys accepted for each node kind. Checked by
// assertKnownKeys (parser.ts) before building the typed attrs object. Keeping
// these as the raw DSL spelling (snake_case) means the parser can diff the
// raw parsed key dict directly against them.
export const PAGE_ATTR_KEYS = new Set([
    "size",
    "direction",
    "gutter",
    "padding",
    "padding_top",
    "padding_bottom",
    "padding_left",
    "padding_right",
    "background",
    "gutter_color",
    "dpi",
    "border",
    "border_color",
]);
export const PANEL_ATTR_KEYS = new Set([
    "importance",
    "z_index",
    "image",
    "image_fit",
    "label",
    "text",
    "text_direction",
    "border",
    "border_color",
    "border_top",
    "border_bottom",
    "border_left",
    "border_right",
    "background",
    "skew_left",
    "skew_right",
    "skew_top",
    "skew_bottom",
    "offset_top",
    "offset_bottom",
    "offset_left",
    "offset_right",
]);
export const BALLOON_ATTR_KEYS = new Set([
    // shared SpeechAttrs
    "text",
    "text_direction",
    "font_size",
    "padding",
    "x",
    "y",
    "width",
    "height",
    "anchor_pos",
    "margin",
    "dx",
    "dy",
    "z_index",
    "background",
    "border_color",
    "border",
    "align",
    // balloon-specific
    "shape",
    "aspect_ratio",
    "corner_radius",
    "inner_ratio",
    "jitter",
    "tail_angle",
    "tail_length",
]);
export const MONOLOGUE_ATTR_KEYS = new Set([
    // shared SpeechAttrs
    "text",
    "text_direction",
    "font_size",
    "padding",
    "x",
    "y",
    "width",
    "height",
    "anchor_pos",
    "margin",
    "dx",
    "dy",
    "z_index",
    "background",
    "border_color",
    "border",
    "align",
    // monologue-specific
    "text_color",
]);
//# sourceMappingURL=ast.js.map