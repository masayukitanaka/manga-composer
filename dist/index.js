/**
 * Public library entry point for Node consumers (CLI, servers).
 *
 * Re-exports the pieces a consumer needs to go from .manga source to SVG/PNG
 * without shelling out to the CLI. This entry pulls in Node-only dependencies
 * (`node:fs` via the filesystem image loader, `@resvg/resvg-js` via svgToPng).
 *
 * For browser use, import from "manga-composer/browser", which exposes the same
 * pure pipeline (parse/layout/SVG) WITHOUT any Node-only imports.
 */
import { parse } from "./parser.js";
import { LayoutEngine } from "./layout/slicing.js";
import { SVGRenderer } from "./renderer/svg.js";
import { createNodeImageLoader } from "./renderer/nodeImageLoader.js";
export * from "./errors.js";
export { parse } from "./parser.js";
export { serialize } from "./serialize.js";
export { LayoutEngine } from "./layout/slicing.js";
export { SVGRenderer } from "./renderer/svg.js";
export { svgToPng } from "./renderer/raster.js";
export { createNodeImageLoader } from "./renderer/nodeImageLoader.js";
export { defaultPanelAttrs, defaultBalloonAttrs, defaultMonologueAttrs } from "./ast.js";
/**
 * Compile .manga source to an SVG string.
 * @param source .manga DSL source text
 * @param sourceDir directory the source lives in, for resolving image paths
 */
export function compileToSvg(source, sourceDir) {
    const page = parse(source);
    const engine = new LayoutEngine(page);
    const panels = engine.layout();
    const speeches = engine.speeches;
    const renderer = new SVGRenderer(page, panels, speeches, createNodeImageLoader(sourceDir));
    return renderer.render();
}
//# sourceMappingURL=index.js.map