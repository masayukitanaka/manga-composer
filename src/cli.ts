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
import { serialize } from "./serialize.js";
import { LayoutEngine } from "./layout/slicing.js";
import { SVGRenderer } from "./renderer/svg.js";
import { createNodeImageLoader } from "./renderer/nodeImageLoader.js";
import { svgToPng } from "./renderer/raster.js";
import { MangaDSLError } from "./errors.js";
import type { Page } from "./ast.js";
import { transposePage, defaultTransposeOptions, type TransposeOptions } from "./transpose.js";

const MM_PER_INCH = 25.4;
const PX_PER_INCH = 96.0;

function withSuffix(path: string, suffix: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) + suffix : path + suffix;
}

interface RenderOpts {
  dpi?: string;
  fontDir: string[];
  fontFile: string[];
}

/**
 * Render a parsed page to a PNG/SVG file. Shared by the default command and the
 * `transpose --out-image` path so image output is byte-identical either way.
 * `sourceDir` resolves image paths; `fmt` is "png" | "svg".
 */
function renderPageToFile(
  page: Page,
  sourceDir: string,
  outputPath: string,
  fmt: string,
  opts: RenderOpts,
): void {
  const engine = new LayoutEngine(page);
  const panels = engine.layout();
  const renderer = new SVGRenderer(page, panels, engine.speeches, createNodeImageLoader(sourceDir));
  const svgStr = renderer.render();

  if (fmt === "svg") {
    writeFileSync(outputPath, svgStr, "utf-8");
    return;
  }
  const dpi = opts.dpi !== undefined ? Number(opts.dpi) : null;
  const font =
    opts.fontDir.length || opts.fontFile.length
      ? {
          fontDirs: opts.fontDir.map((p) => resolve(p)),
          fontFiles: opts.fontFile.map((p) => resolve(p)),
        }
      : undefined;
  let pngBytes: Buffer;
  if (page.config.sizeUnit === "px" && dpi === null) {
    const wPx = Math.round(page.config.widthMm / (MM_PER_INCH / PX_PER_INCH));
    pngBytes = svgToPng(svgStr, { outputWidth: wPx, widthMm: page.config.widthMm, font });
  } else {
    const actualDpi = dpi !== null ? dpi : page.config.dpi;
    pngBytes = svgToPng(svgStr, { dpi: actualDpi, widthMm: page.config.widthMm, font });
  }
  writeFileSync(outputPath, pngBytes);
}

const program = new Command();
// Without this, the root command's `-o` is treated as global and swallows the
// `transpose` subcommand's own `-o` (its value lands nowhere). Positional-options
// mode scopes each `-o` to the command it follows; the default command is
// unaffected (verified: `mc in.manga -o out.png` still parses as before).
program.enablePositionalOptions();

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
  .option(
    "--font-dir <path>",
    "Directory of font files to load for PNG rendering (repeatable)",
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  .option(
    "--font-file <path>",
    "Font file to load for PNG rendering (repeatable)",
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  .action(
    (
      input: string,
      opts: {
        output?: string;
        format: string;
        dpi?: string;
        fontDir: string[];
        fontFile: string[];
      },
    ) => {
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
      renderPageToFile(page, dirname(sourcePath), outputPath, fmt, opts);

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

// ── transpose subcommand ────────────────────────────────────────────────────
// Mirror a .manga left↔right (rtl⇄ltr). See .private/TRANSPOSE_COMMAND.md.
// `-o` writes the transposed .manga source (stdout if omitted); `--out-image`
// additionally renders it to a PNG/SVG so a change can be checked in one step.
program
  .command("transpose")
  .description("Mirror a .manga left↔right (rtl⇄ltr) — writes source and/or an image")
  .argument("<input>", "Path to .manga source file")
  .option("-o, --output <file>", "Transposed .manga output (default: stdout; '-' = stdout)")
  .option("--out-image <file>", "Also render the transposed page to this .png/.svg")
  .option("--image-format <fmt>", "Image format when --out-image is used: png | svg | auto", "auto")
  .option("--direction <mode>", "Reading direction: flip | ltr | rtl (default: flip)", "flip")
  .option("--text", "Also swap text_direction vertical⇄horizontal (default: off)")
  .option("--no-flip-images", "Do NOT toggle each image layer's flip_h (default: toggles)")
  .option("--no-skew", "Do NOT swap/sign-flip skews (default: transforms)")
  .option("--no-tail", "Do NOT mirror balloon tail_angle (default: mirrors)")
  .option("--no-align", "Do NOT swap align/anchor_pos left↔right (default: swaps)")
  .option("--keep-coords", "Do NOT mirror absolute/relative x coordinates (default: mirrors)")
  .option("--in-place", "Overwrite <input> with the transposed source (mutually exclusive with -o)")
  .option("--dry-run", "Report what would change (to stderr); write nothing")
  .option("--dpi <n>", "DPI for --out-image PNG (default: DSL dpi setting or 300)")
  .option(
    "--font-dir <path>",
    "Font directory for --out-image PNG rendering (repeatable)",
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  .option(
    "--font-file <path>",
    "Font file for --out-image PNG rendering (repeatable)",
    (val: string, acc: string[]) => [...acc, val],
    [] as string[],
  )
  .action(
    (
      input: string,
      opts: {
        output?: string;
        outImage?: string;
        imageFormat: string;
        direction: string;
        text?: boolean;
        flipImages: boolean; // commander: --no-flip-images sets false
        skew: boolean;
        tail: boolean;
        align: boolean;
        keepCoords?: boolean;
        inPlace?: boolean;
        dryRun?: boolean;
        dpi?: string;
        fontDir: string[];
        fontFile: string[];
      },
    ) => {
      try {
        if (opts.inPlace && opts.output) {
          process.stderr.write("Error: --in-place and -o are mutually exclusive\n");
          process.exit(1);
        }
        if (opts.direction !== "flip" && opts.direction !== "ltr" && opts.direction !== "rtl") {
          process.stderr.write(`Error: --direction must be flip | ltr | rtl (got ${opts.direction})\n`);
          process.exit(1);
        }

        const sourcePath = resolve(input);
        const source = readFileSync(sourcePath, "utf-8");
        const page = parse(source);

        const tOpts: TransposeOptions = {
          ...defaultTransposeOptions(),
          direction: opts.direction as TransposeOptions["direction"],
          text: opts.text ?? false,
          flipImages: opts.flipImages, // default true; --no-flip-images → false
          skew: opts.skew,
          tail: opts.tail,
          align: opts.align,
          keepCoords: opts.keepCoords ?? false,
        };

        const { page: transposed, warnings } = transposePage(page, tOpts);
        for (const w of warnings) process.stderr.write(`Warning: ${w}\n`);

        if (opts.dryRun) {
          process.stderr.write(
            `Dry run: direction ${page.config.direction} → ${transposed.config.direction}` +
              `, ${warnings.length} warning(s). No output written.\n`,
          );
          return;
        }

        const out = serialize(transposed);

        // Source output: -o file, --in-place, or stdout.
        if (opts.inPlace) {
          writeFileSync(sourcePath, out, "utf-8");
          process.stdout.write(`✓ Transposed in place: ${sourcePath}\n`);
        } else if (opts.output && opts.output !== "-") {
          writeFileSync(resolve(opts.output), out, "utf-8");
          process.stdout.write(`✓ Output: ${resolve(opts.output)}\n`);
        } else if (!opts.outImage) {
          // No source destination and no image → default to stdout source.
          process.stdout.write(out);
        } else if (opts.output === "-") {
          process.stdout.write(out);
        }

        // Image output: render the TRANSPOSED page (image paths resolve relative
        // to the original source dir, since the transform doesn't move files).
        if (opts.outImage) {
          const imgPath = resolve(opts.outImage);
          let fmt = opts.imageFormat;
          if (fmt === "auto") {
            const ext = extname(imgPath).toLowerCase();
            if (ext === ".svg") fmt = "svg";
            else if (ext === ".png") fmt = "png";
            else {
              process.stderr.write(
                `Error: cannot infer image format from ${opts.outImage}; use --image-format png|svg\n`,
              );
              process.exit(1);
            }
          }
          if (fmt !== "png" && fmt !== "svg") {
            process.stderr.write(`Error: --image-format must be png | svg (got ${fmt})\n`);
            process.exit(1);
          }
          renderPageToFile(transposed, dirname(sourcePath), imgPath, fmt, opts);
          process.stdout.write(`✓ Image: ${imgPath}\n`);
        }
      } catch (err) {
        if (err instanceof MangaDSLError) {
          process.stderr.write(`Error: ${err.message}\n`);
          process.exit(1);
        }
        process.stderr.write(`Unexpected error: ${String(err)}\n`);
        process.exit(1);
      }
    },
  );

program.parse();
