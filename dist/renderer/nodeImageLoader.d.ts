/**
 * Node/filesystem-backed ImageLoader.
 *
 * This is the ONLY renderer module that touches `node:fs`/`node:path`, so it
 * must never be imported from the browser entry point. The CLI and the main
 * library entry (index.ts) wire this in as the default loader, preserving the
 * original filesystem behaviour of SVGRenderer._render_image.
 */
import type { ImageLoader } from "./imageLoader.js";
/**
 * Build an ImageLoader that resolves paths relative to `sourceDir` from disk.
 * Mirrors the pre-refactor inline logic in svg.ts (`readFileSync(join(...))`).
 */
export declare function createNodeImageLoader(sourceDir: string): ImageLoader;
//# sourceMappingURL=nodeImageLoader.d.ts.map