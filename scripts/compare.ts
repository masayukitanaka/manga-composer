/**
 * Verification harness.
 *
 *   npm run compare                      # examples2/*.manga, SVG diff only (the gate)
 *   npm run compare -- --all             # also examples/*.manga
 *   npm run compare -- --png             # also PNG pixel diff (informational)
 *   npm run compare -- sakura            # substring filter on filename
 *   npm run compare -- --regenerate-refs # re-run Python CLI to refresh refs
 *
 * SVG structural comparison is the hard gate (exit 0 iff all selected
 * examples2 files pass). PNG diff is informational only.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffSvg, type DiffResult } from "./svgDiff.js";
import { compileToSvg } from "../src/index.js";
import { generateReferences } from "./generate-references.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PY_ROOT = join(ROOT, "manga-gen-python");
const REF_ROOT = join(ROOT, "test", "references");

interface FileResult {
  sub: string;
  name: string;
  svg: DiffResult | { pass: false; error: string };
  png?: { ratio: number; note: string };
}

function selectFiles(sub: string, filter: string | null): string[] {
  const dir = join(PY_ROOT, sub);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".manga"))
    .filter((f) => (filter ? f.includes(filter) : true))
    .sort();
}

async function runPngDiff(
  refSvgPath: string,
  candidateSvg: string,
): Promise<{ ratio: number; note: string }> {
  // Lazy imports so `npm run compare` (SVG-only) doesn't pay for native deps.
  const { Resvg } = await import("@resvg/resvg-js");
  const { PNG } = await import("pngjs");
  const pixelmatch = (await import("pixelmatch")).default;

  const DPI = 150;
  const renderPng = (svg: string): InstanceType<typeof PNG> => {
    const r = new Resvg(svg, { dpi: DPI });
    const data = r.render().asPng();
    return PNG.sync.read(Buffer.from(data));
  };

  const refSvg = readFileSync(refSvgPath, "utf-8");
  const refPng = renderPng(refSvg);
  const candPng = renderPng(candidateSvg);

  if (refPng.width !== candPng.width || refPng.height !== candPng.height) {
    return {
      ratio: 1,
      note: `dimension mismatch ref ${refPng.width}x${refPng.height} vs cand ${candPng.width}x${candPng.height}`,
    };
  }

  const { width, height } = refPng;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(refPng.data, candPng.data, diff.data, width, height, {
    threshold: 0.1,
  });
  const ratio = diffPixels / (width * height);
  return { ratio, note: `${(ratio * 100).toFixed(2)}% pixels differ` };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const doPng = argv.includes("--png");
  const regen = argv.includes("--regenerate-refs");
  const filter = argv.find((a) => !a.startsWith("--")) ?? null;

  if (regen) {
    generateReferences();
  }

  const subs = all ? ["examples2", "examples"] : ["examples2"];
  const results: FileResult[] = [];

  for (const sub of subs) {
    for (const name of selectFiles(sub, filter)) {
      const base = name.replace(/\.manga$/, "");
      const refPath = join(REF_ROOT, sub, `${base}.svg`);
      if (!existsSync(refPath)) {
        results.push({
          sub,
          name,
          svg: { pass: false, error: `no reference SVG at ${refPath} (run --regenerate-refs)` },
        });
        continue;
      }
      const srcPath = join(PY_ROOT, sub, name);
      const source = readFileSync(srcPath, "utf-8");
      const refSvg = readFileSync(refPath, "utf-8");

      let candidateSvg: string;
      try {
        candidateSvg = compileToSvg(source, dirname(srcPath));
      } catch (err) {
        results.push({ sub, name, svg: { pass: false, error: String(err) } });
        continue;
      }

      const svg = diffSvg(refSvg, candidateSvg);
      const fr: FileResult = { sub, name, svg };
      if (doPng) {
        try {
          fr.png = await runPngDiff(refPath, candidateSvg);
        } catch (err) {
          fr.png = { ratio: 1, note: `png diff error: ${String(err)}` };
        }
      }
      results.push(fr);
    }
  }

  // Report.
  let gateFail = 0;
  for (const r of results) {
    const svgPass = "pass" in r.svg && r.svg.pass;
    const status = svgPass ? "PASS" : "FAIL";
    const pngStr = r.png ? `  [png ${r.png.note}]` : "";
    process.stdout.write(`${status}  ${r.sub}/${r.name}${pngStr}\n`);
    if (!svgPass) {
      if ("error" in r.svg) {
        process.stdout.write(`      error: ${r.svg.error}\n`);
      } else {
        for (const m of r.svg.mismatches.slice(0, 12)) {
          process.stdout.write(`      ${m.kind} @ ${m.path}: ${m.detail}\n`);
        }
        if (r.svg.mismatches.length > 12) {
          process.stdout.write(`      ... and ${r.svg.mismatches.length - 12} more\n`);
        }
      }
      if (r.sub === "examples2") gateFail++;
    }
  }

  const total = results.length;
  const passed = results.filter((r) => "pass" in r.svg && r.svg.pass).length;
  process.stdout.write(`\n${passed}/${total} passed SVG comparison.\n`);

  // Exit 0 iff all examples2 files passed (the acceptance gate).
  const examples2Results = results.filter((r) => r.sub === "examples2");
  const examples2Pass = examples2Results.every((r) => "pass" in r.svg && r.svg.pass);
  if (examples2Results.length > 0 && examples2Pass) {
    process.stdout.write("examples2 gate: PASS ✅\n");
    process.exit(0);
  }
  if (examples2Results.length > 0) {
    process.stdout.write(`examples2 gate: FAIL (${gateFail} file(s) failing)\n`);
    process.exit(1);
  }
  // No examples2 selected (e.g. filtered to an examples/ file only).
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(2);
});
