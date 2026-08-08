/**
 * Pins the deliberate LR/TB skew-resolution asymmetry (REFACTORING.md #7).
 *
 * When BOTH sides of one shared gutter set a skew:
 *   - vertical (left/right) gutter: the left panel's skew "wins" (effective_skew)
 *   - horizontal (top/bottom) gutter: the two are AVERAGED
 *
 * `.private/SPEC.md` §5.4.3 describes the LR rule as "average", i.e. the spec and
 * the code disagree; the code is the source of truth for the golden references,
 * so this test freezes the current behavior. If a future refactor "helpfully"
 * unifies the two rules, this test fails and forces a deliberate decision.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { LayoutEngine } from "../../src/layout/slicing.js";

function sharedAngle(src: string): number[] {
  const engine = new LayoutEngine(parse(src));
  engine.layout();
  const angles: number[] = [];
  for (const p of engine.panels) {
    const sl = p.right.skewline ?? p.left.skewline ?? p.bottom.skewline ?? p.top.skewline;
    if (sl) angles.push(sl.skew_angle);
  }
  return angles;
}

describe("skew resolution asymmetry (frozen)", () => {
  it("vertical gutter: left panel's skew_right wins over right panel's skew_left", () => {
    // left skew_right: 10, right skew_left: 6 → effective = 10 (one wins).
    const angles = sharedAngle(
      `page { padding:5 row { col { panel L { skew_right: 10 } } col { panel R { skew_left: 6 } } } }`,
    );
    expect(angles).toEqual([10, 10]);
  });

  it("horizontal gutter: top skew_bottom and bottom skew_top are averaged", () => {
    // top skew_bottom: 10, bottom skew_top: 6 → shared = (10+6)/2 = 8.
    const angles = sharedAngle(
      `page { padding:5 col { row { panel T { skew_bottom: 10 } } row { panel B { skew_top: 6 } } } }`,
    );
    expect(angles).toEqual([8, 8]);
  });

  it("single-sided skew resolves the same on both axes (no asymmetry when one is 0)", () => {
    expect(
      sharedAngle(`page { padding:5 row { col { panel L { skew_right: 6 } } col { panel R {} } } }`),
    ).toEqual([6, 6]);
    expect(
      sharedAngle(`page { padding:5 col { row { panel T { skew_bottom: 6 } } row { panel B {} } } }`),
    ).toEqual([6, 6]);
  });
});
