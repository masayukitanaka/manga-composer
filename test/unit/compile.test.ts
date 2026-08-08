import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compileToSvg } from "../../src/index.js";
import { diffSvg } from "../../scripts/svgDiff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The `.manga` sources live in the package itself (examples/, examples2/); the
// golden SVGs are kept under test/references/. (This used to read sources from a
// `manga-gen-python/` checkout that is no longer vendored — the sources moved
// into the package.)
//
// examples2/ references are the acceptance corpus and still match the original
// Python `manga-gen` output byte-for-byte. Five examples/ references
// (balloon_basic, balloon_comic_ltr, balloon_shapes, og-image, with_image) were
// REBASED onto the current TS output because TS-port-only features added after
// the port — richer font stack / text metrics / vertical-glyph tuning, and
// default image clipping — intentionally changed their text and clip-path
// output. The rebase was validated: every diff against the old references was
// classified and traced to one of those added features (no skew/layout geometry
// changed). The Python CLI is gone, so TS is now the source of truth for these.
const PKG_ROOT = join(__dirname, "../..");
const REF_ROOT = join(__dirname, "../references");

function refPath(sub: string, name: string): string {
  return join(REF_ROOT, sub, name.replace(/\.manga$/, ".svg"));
}

function compareFile(sub: string, name: string): boolean {
  const src = readFileSync(join(PKG_ROOT, sub, name), "utf-8");
  const ref = readFileSync(refPath(sub, name), "utf-8");
  const cand = compileToSvg(src, join(PKG_ROOT, sub));
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

describe("compileToSvg matches the reference SVGs (structural diff)", () => {
  it("all examples2/ files match (the acceptance gate)", () => {
    for (const name of ["sakura.manga", "jujutsu.manga", "hxh.manga", "nodame.manga", "boys.manga"]) {
      expect(compareFile("examples2", name), name).toBe(true);
    }
  });

  it("all examples/ files with a reference SVG match (balloon paths compared at bbox level per svgDiff)", () => {
    const dir = join(PKG_ROOT, "examples");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".manga"))
      // Some examples (TS-port-only features, e.g. image_layers / text_styles)
      // have no Python reference SVG — skip those rather than fail.
      .filter((f) => existsSync(refPath("examples", f)));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(compareFile("examples", f), f).toBe(true);
    }
  });
});
