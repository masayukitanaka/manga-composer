/**
 * Pins the three deliberate length-parsing policies now routed through the
 * single `normalizeLength` core (REFACTORING.md #9). Each DSL context keeps its
 * own bare-number meaning and unit allow-list; this file freezes those
 * differences so a future change to the shared normalizer can't silently drift
 * one context toward another.
 *
 *   row/col size : unit REQUIRED (no bare number), accepts mm/px/pt/%, > 0
 *   image layer  : bare number = mm, accepts mm/% only,               > 0 (w/h)
 *   line_height  : bare number = multiplier, `140%` folds to 1.4, mm absolute
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { BalloonNode, ImageLayer } from "../../src/ast.js";

function firstLayer(src: string): ImageLayer {
  const page = parse(src);
  const panel = page.children[0];
  if (panel.kind !== "panel") throw new Error("expected a panel");
  return panel.attrs.imageLayers[0];
}

function balloonLineHeight(src: string) {
  const page = parse(src);
  const panel = page.children[0];
  if (panel.kind !== "panel") throw new Error("expected a panel");
  return (panel.speeches[0] as BalloonNode).attrs.lineHeight;
}

describe("length policies (unified normalizeLength)", () => {
  describe("row/col size — unit required, mm/px/pt/% accepted", () => {
    it("accepts mm, px, pt and %", () => {
      for (const size of ["40mm", "40px", "40pt", "40%"]) {
        expect(() =>
          parse(`page { row height: ${size} { panel a } row { panel b } }`),
        ).not.toThrow();
      }
    });

    it("rejects a bare number (unit required)", () => {
      expect(() => parse(`page { row height: 40 { panel a } row { panel b } }`)).toThrow(
        /unit/,
      );
    });

    it("rejects non-positive sizes", () => {
      expect(() => parse(`page { row height: 0mm { panel a } row { panel b } }`)).toThrow(
        /must be positive/,
      );
      expect(() => parse(`page { row height: -5mm { panel a } row { panel b } }`)).toThrow(
        /must be positive/,
      );
    });
  });

  describe("image layer — bare number = mm, mm/% only", () => {
    it("treats a bare number as mm", () => {
      const l = firstLayer(`page { panel s { images { { "a.png" width: 40 } } } }`);
      expect(l.width).toEqual({ value: 40, unit: "mm" });
    });

    it("keeps % as %", () => {
      const l = firstLayer(`page { panel s { images { { "a.png" width: 40% } } } }`);
      expect(l.width).toEqual({ value: 40, unit: "%" });
    });

    it("rejects px/pt", () => {
      expect(() =>
        parse(`page { panel s { images { { "a.png" width: 40px } } } }`),
      ).toThrow(/must use mm\/%/);
      expect(() =>
        parse(`page { panel s { images { { "a.png" width: 40pt } } } }`),
      ).toThrow(/must use mm\/%/);
    });
  });

  describe("line_height — bare number = multiplier, % folds by 100", () => {
    it("treats a bare number as a multiplier", () => {
      expect(balloonLineHeight(`page { panel p { balloon { text: "x" line_height: 1.4 } } }`)).toEqual(
        { value: 1.4, unit: "%" },
      );
    });

    it("folds 140% to 1.4", () => {
      expect(balloonLineHeight(`page { panel p { balloon { text: "x" line_height: 140% } } }`)).toEqual(
        { value: 1.4, unit: "%" },
      );
    });

    it("keeps mm as an absolute advance", () => {
      expect(balloonLineHeight(`page { panel p { balloon { text: "x" line_height: 6mm } } }`)).toEqual(
        { value: 6, unit: "mm" },
      );
    });

    it("rejects px", () => {
      expect(() =>
        parse(`page { panel p { balloon { text: "x" line_height: 10px } } }`),
      ).toThrow(/must use mm\/%/);
    });
  });
});
