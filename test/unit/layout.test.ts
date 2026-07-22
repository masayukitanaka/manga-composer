import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "../../src/parser.js";
import { LayoutEngine, type LayoutedPanel } from "../../src/layout/slicing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = join(__dirname, "../../manga-gen-python");

function layoutFile(sub: string, name: string): LayoutedPanel[] {
  const page = parse(readFileSync(join(PY_ROOT, sub, name), "utf-8"));
  return new LayoutEngine(page).layout();
}

function byId(panels: LayoutedPanel[], id: string): LayoutedPanel {
  const p = panels.find((x) => x.id === id);
  if (!p) throw new Error(`panel ${id} not found`);
  return p;
}

function expectRect(
  p: LayoutedPanel,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  expect(p.rect.x).toBeCloseTo(x, 3);
  expect(p.rect.y).toBeCloseTo(y, 3);
  expect(p.rect.w).toBeCloseTo(w, 3);
  expect(p.rect.h).toBeCloseTo(h, 3);
}

describe("layout engine (rects match Python reference)", () => {
  it("simple.manga: single panel fills the padded page", () => {
    // A4 210x297, padding 10 → 190x277 at (10,10)
    const panels = layoutFile("examples", "simple.manga");
    expect(panels).toHaveLength(1);
    expectRect(byId(panels, "hero"), 10, 10, 190, 277);
  });

  it("grid.manga: 2x2 grid with default gutter 5", () => {
    const panels = layoutFile("examples", "grid.manga");
    expectRect(byId(panels, "p1"), 10.0, 10.0, 92.5, 136.0);
    expectRect(byId(panels, "p2"), 107.5, 10.0, 92.5, 136.0);
    expectRect(byId(panels, "p3"), 10.0, 151.0, 92.5, 136.0);
    expectRect(byId(panels, "p4"), 107.5, 151.0, 92.5, 136.0);
  });

  it("lays out every examples2/ file without error", () => {
    for (const name of ["sakura.manga", "jujutsu.manga", "hxh.manga", "nodame.manga", "boys.manga"]) {
      expect(() => layoutFile("examples2", name), name).not.toThrow();
    }
  });
});
