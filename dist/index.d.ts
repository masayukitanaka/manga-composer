/**
 * Public library entry point for programmatic use.
 *
 * Re-exports the pieces a consumer needs to go from .manga source to SVG/PNG
 * without shelling out to the CLI.
 */
export * from "./errors.js";
export { parse } from "./parser.js";
export { LayoutEngine } from "./layout/slicing.js";
export { SVGRenderer } from "./renderer/svg.js";
export { svgToPng } from "./renderer/raster.js";
export type { Page } from "./ast.js";
/**
 * Compile .manga source to an SVG string.
 * @param source .manga DSL source text
 * @param sourceDir directory the source lives in, for resolving image paths
 */
export declare function compileToSvg(source: string, sourceDir: string): string;
//# sourceMappingURL=index.d.ts.map