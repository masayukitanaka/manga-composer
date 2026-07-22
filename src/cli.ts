/**
 * Command-line interface for the MangaDSL compiler.
 *
 * Port of manga-gen-python/src/manga_gen/cli.py (Click → commander). Mirrors
 * the same flags, auto-format detection, default output path, and error
 * handling (MangaDSLError → "Error: ..." exit 1; else "Unexpected error: ...").
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { parse } from "./parser.js";
import { LayoutEngine } from "./layout/slicing.js";
import { SVGRenderer } from "./renderer/svg.js";
import { svgToPng } from "./renderer/raster.js";
import { MangaDSLError } from "./errors.js";

const MM_PER_INCH = 25.4;
const PX_PER_INCH = 96.0;

function withSuffix(path: string, suffix: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) + suffix : path + suffix;
}

const program = new Command();

program
  .name("manga-composer")
  .description("MangaDSL compiler — convert .manga files to images.")
  .argument("<input>", "Path to .manga source file")
  .option("-o, --output <file>", "Output file (.png or .svg)")
  .option(
    "--format <fmt>",
    "Output format: png | svg | auto (default: auto-detect from extension)",
    "auto",
  )
  .option("--dpi <n>", "DPI for PNG output (default: use DSL dpi setting or 300)")
  .action((input: string, opts: { output?: string; format: string; dpi?: string }) => {
    try {
      const sourcePath = resolve(input);
      const source = readFileSync(sourcePath, "utf-8");

      process.stdout.write(`Parsing ${input}...\n`);
      const page = parse(source);

      process.stdout.write("Computing layout...\n");
      const engine = new LayoutEngine(page);
      const panels = engine.layout();
      const speeches = engine.speeches;
      process.stdout.write(
        `Layouted ${panels.length} panel(s), ${speeches.length} speech element(s)\n`,
      );

      const outputPath = opts.output ? resolve(opts.output) : withSuffix(sourcePath, ".png");

      let fmt = opts.format;
      if (fmt === "auto") {
        fmt = extname(outputPath).toLowerCase() === ".svg" ? "svg" : "png";
      }

      process.stdout.write(`Rendering ${fmt.toUpperCase()}...\n`);
      const renderer = new SVGRenderer(page, panels, speeches, dirname(sourcePath));
      const svgStr = renderer.render();

      if (fmt === "svg") {
        writeFileSync(outputPath, svgStr, "utf-8");
      } else {
        const dpi = opts.dpi !== undefined ? Number(opts.dpi) : null;
        let pngBytes: Buffer;
        if (page.config.sizeUnit === "px" && dpi === null) {
          const wPx = Math.round(page.config.widthMm / (MM_PER_INCH / PX_PER_INCH));
          pngBytes = svgToPng(svgStr, { outputWidth: wPx, widthMm: page.config.widthMm });
        } else {
          const actualDpi = dpi !== null ? dpi : page.config.dpi;
          pngBytes = svgToPng(svgStr, { dpi: actualDpi, widthMm: page.config.widthMm });
        }
        writeFileSync(outputPath, pngBytes);
      }

      process.stdout.write(`✓ Output: ${outputPath}\n`);
    } catch (err) {
      if (err instanceof MangaDSLError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      process.stderr.write(`Unexpected error: ${String(err)}\n`);
      process.exit(1);
    }
  });

program.parse();
