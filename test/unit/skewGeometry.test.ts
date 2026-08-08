import { describe, it, expect } from "vitest";
import { SkewLine, SkewHLine } from "../../src/layout/slicing.js";
import { _skewline_intersection } from "../../src/renderer/svg.js";

describe("_skewline_intersection", () => {
  it("returns a point that lies on BOTH lines (self-consistent)", () => {
    // A skewed horizontal border and a skewed vertical border.
    const hsl = new SkewHLine(/*base_y*/ 100, /*mid_x*/ 50, /*angle*/ 10);
    const vsl = new SkewLine(/*base_x*/ 60, /*mid_y*/ 120, /*angle*/ 8);
    const p = _skewline_intersection(hsl, vsl);
    expect(p).not.toBeNull();
    const [xi, yi] = p!;
    // The horizontal line's y at xi must equal yi.
    expect(hsl.y_at(xi)).toBeCloseTo(yi, 9);
    // The vertical line's x at yi must equal xi.
    expect(vsl.x_at(yi)).toBeCloseTo(xi, 9);
  });

  it("works for the mirror case (negative skews)", () => {
    const hsl = new SkewHLine(210, 158.5, -10);
    const vsl = new SkewLine(307, 148.5, -8);
    const p = _skewline_intersection(hsl, vsl);
    expect(p).not.toBeNull();
    const [xi, yi] = p!;
    expect(hsl.y_at(xi)).toBeCloseTo(yi, 9);
    expect(vsl.x_at(yi)).toBeCloseTo(xi, 9);
  });

  it("handles a flat horizontal line (angle 0): intersection y = base_y", () => {
    const hsl = new SkewHLine(150, 40, 0); // horizontal
    const vsl = new SkewLine(80, 150, 12); // skewed vertical
    const p = _skewline_intersection(hsl, vsl);
    expect(p).not.toBeNull();
    const [xi, yi] = p!;
    expect(yi).toBeCloseTo(150, 9); // flat line's y
    expect(vsl.x_at(yi)).toBeCloseTo(xi, 9);
  });

  it("returns null when the lines are (near-)parallel (1 - tan_h·tan_v ≈ 0)", () => {
    // tan(45°)=1, and a vertical line whose tan is also 1 → denom = 0.
    const hsl = new SkewHLine(100, 50, 45);
    const vsl = new SkewLine(60, 120, 45);
    expect(_skewline_intersection(hsl, vsl)).toBeNull();
  });
});
