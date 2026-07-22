/**
 * Generate reference SVGs by running the Python `manga-gen` CLI over every
 * examples/ and examples2/ .manga file, storing the results under
 * test/references/{examples,examples2}/*.svg (git-tracked).
 *
 * Run once (or with --regenerate from compare.ts) — the Python source never
 * changes during the port, so day-to-day comparison reads the cached SVGs.
 *
 * Usage: npm run generate-references
 */

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PY_ROOT = join(ROOT, "manga-gen-python");
const REF_ROOT = join(ROOT, "test", "references");

const SUBDIRS = ["examples", "examples2"] as const;

function which(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function generateReferences(): void {
  if (!which("manga-gen")) {
    throw new Error(
      "`manga-gen` (Python reference CLI) not found on PATH. Ensure manga-gen-python is installed (pip install -e manga-gen-python).",
    );
  }
  if (!existsSync(PY_ROOT)) {
    throw new Error(`manga-gen-python not found at ${PY_ROOT}`);
  }

  const tmp = join(tmpdir(), "manga-composer-refs");
  mkdirSync(tmp, { recursive: true });

  let count = 0;
  for (const sub of SUBDIRS) {
    const srcDir = join(PY_ROOT, sub);
    const outDir = join(REF_ROOT, sub);
    mkdirSync(outDir, { recursive: true });
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".manga"));
    for (const f of files) {
      const base = f.replace(/\.manga$/, "");
      const tmpSvg = join(tmp, `${sub}_${base}.svg`);
      execFileSync("manga-gen", [join(srcDir, f), "-o", tmpSvg, "--format", "svg"], {
        stdio: "ignore",
      });
      copyFileSync(tmpSvg, join(outDir, `${base}.svg`));
      count++;
    }
  }
  process.stdout.write(`Generated ${count} reference SVG(s) under ${REF_ROOT}\n`);
}

// Run when invoked directly (not when imported by compare.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReferences();
}
