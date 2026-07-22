/**
 * Raster (PNG) renderer using @resvg/resvg-js.
 *
 * Port of manga-gen-python/src/manga_gen/renderer/raster.py (was CairoSVG).
 * resvg is a DIFFERENT rasterizer than CairoSVG — antialiasing/font rendering
 * differs pixel-for-pixel even from identical SVG. PNG parity is secondary per
 * the acceptance criteria (docs/PORTING_GUIDE.md §0).
 *
 * Two call shapes mirror cli.py:
 *   - exact pixel size (px-unit page sizes): render at a fixed width in px.
 *   - DPI-based: mm → px via the requested dpi.
 */

import { Resvg } from "@resvg/resvg-js";
import { RenderError } from "../errors.js";

const MM_PER_INCH = 25.4;

/**
 * Convert an SVG string to PNG bytes.
 *
 * @param svgString the SVG markup
 * @param opts.dpi DPI for mm→px scaling (default 300); ignored if outputWidth given
 * @param opts.outputWidth exact output width in px (for px-unit page sizes)
 * @param opts.widthMm the page width in mm — required to size the raster from dpi
 */
export function svgToPng(
  svgString: string,
  opts: { dpi?: number; outputWidth?: number; widthMm: number },
): Buffer {
  try {
    let fitTo: { mode: "width"; value: number };
    if (opts.outputWidth !== undefined) {
      fitTo = { mode: "width", value: Math.round(opts.outputWidth) };
    } else {
      const dpi = opts.dpi ?? 300;
      const w_px = Math.round((opts.widthMm / MM_PER_INCH) * dpi);
      fitTo = { mode: "width", value: w_px };
    }
    const resvg = new Resvg(svgString, { fitTo, background: "#ffffff" });
    const rendered = resvg.render();
    return Buffer.from(rendered.asPng());
  } catch (e) {
    throw new RenderError(`PNG rasterization failed: ${String(e)}`);
  }
}
