import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compileToSvg } from "../../src/index.js";
import { diffSvg } from "../../scripts/svgDiff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = join(__dirname, "../../manga-gen-python");
const REF_ROOT = join(__dirname, "../references");

function compareFile(sub: string, name: string): boolean {
  const src = readFileSync(join(PY_ROOT, sub, name), "utf-8");
  const ref = readFileSync(join(REF_ROOT, sub, name.replace(/\.manga$/, ".svg")), "utf-8");
  const cand = compileToSvg(src, join(PY_ROOT, sub));
  const result = diffSvg(ref, cand);
  if (!result.pass) {
    // Surface the first few mismatches in the assertion message.
    const detail = result.mismatches
      .slice(0, 5)
      .map((m) => `${m.kind} @ ${m.path}: ${m.detail}`)
      .join("\n");
    throw new Error(`${sub}/${name} SVG mismatch:\n${detail}`);
  }
  return true;
}

describe("compileToSvg matches the Python reference (SVG structural diff)", () => {
  it("all examples2/ files match (the acceptance gate)", () => {
    for (const name of ["sakura.manga", "jujutsu.manga", "hxh.manga", "nodame.manga", "boys.manga"]) {
      expect(compareFile("examples2", name), name).toBe(true);
    }
  });

  it("all examples/ files match (balloon paths compared at bbox level per svgDiff)", () => {
    const dir = join(PY_ROOT, "examples");
    const files = readdirSync(dir).filter((f) => f.endsWith(".manga"));
    for (const f of files) {
      expect(compareFile("examples", f), f).toBe(true);
    }
  });
});
