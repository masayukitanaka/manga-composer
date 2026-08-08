/**
 * Raster (PNG) renderer using @resvg/resvg-js.
 *
 * Port of manga-gen-python/src/manga_gen/renderer/raster.py (was CairoSVG).
 * resvg is a DIFFERENT rasterizer than CairoSVG — antialiasing/font rendering
 * differs pixel-for-pixel even from identical SVG. PNG parity is secondary per
 * the acceptance criteria.
 *
 * Two call shapes mirror cli.py:
 *   - exact pixel size (px-unit page sizes): render at a fixed width in px.
 *   - DPI-based: mm → px via the requested dpi.
 */
/**
 * Font resolution options passed through to resvg. The DSL's `font_family` only
 * names candidates in the SVG; resvg picks the actual glyphs from whatever it
 * has loaded, so supply files/dirs here to make rendering device-independent.
 * See .private/FONT.md §5.
 */
export interface FontOptions {
    loadSystemFonts?: boolean;
    fontFiles?: string[];
    fontDirs?: string[];
    defaultFontFamily?: string;
    serifFamily?: string;
    sansSerifFamily?: string;
    monospaceFamily?: string;
}
/**
 * Convert an SVG string to PNG bytes.
 *
 * @param svgString the SVG markup
 * @param opts.dpi DPI for mm→px scaling (default 300); ignored if outputWidth given
 * @param opts.outputWidth exact output width in px (for px-unit page sizes)
 * @param opts.widthMm the page width in mm — required to size the raster from dpi
 * @param opts.font font resolution options forwarded to resvg (optional)
 */
export declare function svgToPng(svgString: string, opts: {
    dpi?: number;
    outputWidth?: number;
    widthMm: number;
    font?: FontOptions;
}): Buffer;
//# sourceMappingURL=raster.d.ts.map