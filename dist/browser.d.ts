/**
 * Browser-safe entry point.
 *
 * Exposes the full parse → layout → SVG pipeline with NO Node-only imports:
 * - no `node:fs` / `node:path` (image loading is dependency-injected)
 * - no `@resvg/resvg-js` (PNG rasterization is Node-only; browsers use a WASM
 *   rasterizer or a server round-trip instead — see docs/SPEC.md §6)
 *
 * A browser host resolves panel images by passing its own ImageLoader to
 * SVGRenderer (e.g. one backed by uploaded blobs). Omit it and image panels
 * render a placeholder box.
 */
import type { ImageLoader } from "./renderer/imageLoader.js";
export * from "./errors.js";
export { parse } from "./parser.js";
export { serialize } from "./serialize.js";
export { LayoutEngine } from "./layout/slicing.js";
export { SVGRenderer } from "./renderer/svg.js";
export type { ImageLoader, LoadedImage } from "./renderer/imageLoader.js";
export type { Page, PanelNode, RowNode, ColNode, LayoutNode, PanelAttrs, SpeechNode, BalloonNode, MonologueNode, BalloonAttrs, MonologueAttrs, BalloonShape, AnchorPos, } from "./ast.js";
export { defaultPanelAttrs, defaultBalloonAttrs, defaultMonologueAttrs } from "./ast.js";
/**
 * Compile .manga source to an SVG string, in the browser.
 * @param source .manga DSL source text
 * @param imageLoader optional resolver for panel `image:` paths. When omitted,
 *   image panels render a placeholder box.
 */
export declare function compileToSvg(source: string, imageLoader?: ImageLoader | null): string;
//# sourceMappingURL=browser.d.ts.map