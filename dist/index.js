/**
 * Public library entry point for programmatic use.
 *
 * Re-exports the pieces a consumer needs to go from .manga source to SVG/PNG
 * without shelling out to the CLI.
 */
import { parse } from "./parser.js";
import { LayoutEngine } from "./layout/slicing.js";
import { SVGRenderer } from "./renderer/svg.js";
export * from "./errors.js";
export { parse } from "./parser.js";
export { LayoutEngine } from "./layout/slicing.js";
export { SVGRenderer } from "./renderer/svg.js";
export { svgToPng } from "./renderer/raster.js";
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
    const renderer = new SVGRenderer(page, panels, speeches, sourceDir);
    return renderer.render();
}
//# sourceMappingURL=index.js.map