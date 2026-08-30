/**
 * Tests for the `transpose` (left↔right mirror) core. Spec:
 * .private/TRANSPOSE_COMMAND.md. Covers the safe-core mappings, the involution
 * property, direction idempotence, coordinate mirroring, and the layout-
 * dependent warnings.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { serialize } from "../../src/serialize.js";
import { transposePage, defaultTransposeOptions } from "../../src/transpose.js";
import type { PanelNode, BalloonNode, RowNode } from "../../src/ast.js";

function tp(src: string, over: Partial<ReturnType<typeof defaultTransposeOptions>> = {}) {
  return transposePage(parse(src), { ...defaultTransposeOptions(), ...over });
}

/** First panel reached by depth-first descent. */
function firstPanel(page: ReturnType<typeof parse>): PanelNode {
  const dig = (nodes: (PanelNode | RowNode | { kind: string })[]): PanelNode => {
    for (const n of nodes as PanelNode[]) {
      if (n.kind === "panel") return n;
      const p = dig((n as unknown as RowNode).children);
      if (p) return p;
    }
    throw new Error("no panel");
  };
  return dig(page.children as unknown as PanelNode[]);
}

describe("transpose — safe core mappings", () => {
  it("flips page direction rtl→ltr and swaps paddings", () => {
    const { page } = tp(`page { direction: rtl padding_left: 20 padding_right: 5 panel a {} }`);
    expect(page.config.direction).toBe("ltr");
    expect(page.config.paddingLeft).toBe(5);
    expect(page.config.paddingRight).toBe(20);
  });

  it("swaps panel border_left/right and offset_left/right", () => {
    const { page } = tp(`page { panel a { border_left: 0.5 border_right: 2 offset_left: 3 offset_right: 1 } }`);
    const p = firstPanel(page);
    expect(p.attrs.borderLeft).toBe(2);
    expect(p.attrs.borderRight).toBe(0.5);
    expect(p.attrs.offsetLeft).toBe(1);
    expect(p.attrs.offsetRight).toBe(3);
  });

  it("swaps and sign-flips skews", () => {
    const { page } = tp(`page { panel a { skew_left: 6 skew_right: 2 skew_bottom: 8 } }`);
    const p = firstPanel(page);
    expect(p.attrs.skewLeft).toBe(-2); // was skew_right
    expect(p.attrs.skewRight).toBe(-6); // was skew_left
    expect(p.attrs.skewBottom).toBe(-8);
  });

  it("--no-skew leaves skews untouched", () => {
    const { page } = tp(`page { panel a { skew_left: 6 skew_bottom: 8 } }`, { skew: false });
    const p = firstPanel(page);
    expect(p.attrs.skewLeft).toBe(6);
    expect(p.attrs.skewBottom).toBe(8);
  });

  it("mirrors speech align (start→end) and anchor_pos left↔right", () => {
    const { page } = tp(`page { panel a { balloon { text: "x" align: start anchor_pos: top_left } } }`);
    const b = firstPanel(page).speeches[0] as BalloonNode;
    expect(b.attrs.align).toBe("end");
    expect(b.attrs.anchorPos).toBe("top_right");
  });

  it("mirrors image layer anchor_pos and toggles flip_h", () => {
    const { page } = tp(`page { panel a { images { { "x.png" anchor_pos: bottom_right flip_h: true } } } }`);
    const l = firstPanel(page).attrs.imageLayers[0];
    expect(l.anchorPos).toBe("bottom_left");
    expect(l.flipH).toBe(false);
  });

  it("--no-flip-images keeps flip_h", () => {
    const { page } = tp(`page { panel a { images { { "x.png" flip_h: true } } } }`, { flipImages: false });
    expect(firstPanel(page).attrs.imageLayers[0].flipH).toBe(true);
  });

  it("sign-flips dx (speech and image layer)", () => {
    const { page } = tp(`page { panel a {
      images { { "x.png" dx: 2mm } }
      balloon { text: "y" dx: 3 }
    } }`);
    const p = firstPanel(page);
    expect(p.attrs.imageLayers[0].dx).toEqual({ value: -2, unit: "mm" });
    expect((p.speeches[0] as BalloonNode).attrs.dx).toBe(-3);
  });
});

describe("transpose — coordinate mirroring", () => {
  it("mirrors image-layer % x (100 − x − width)", () => {
    const { page, warnings } = tp(`page { panel a { images { { "x.png" x: 10% width: 40% } } } }`);
    expect(firstPanel(page).attrs.imageLayers[0].x).toEqual({ value: 50, unit: "%" });
    expect(warnings).toHaveLength(0);
  });

  it("mirrors balloon absolute x with explicit width (W − x − width)", () => {
    // A4 default width = 210. x=60 width=30 → 210-60-30 = 120.
    const { page, warnings } = tp(`page { panel a { balloon { text: "x" x: 60 width: 30 } } }`);
    expect((firstPanel(page).speeches[0] as BalloonNode).attrs.x).toBe(120);
    expect(warnings).toHaveLength(0);
  });

  it("warns and keeps balloon absolute x when width is auto", () => {
    const { page, warnings } = tp(`page { panel a { balloon { text: "x" x: 60 } } }`);
    expect((firstPanel(page).speeches[0] as BalloonNode).attrs.x).toBe(60); // unchanged
    expect(warnings.join("")).toMatch(/auto width/);
  });

  it("warns and keeps image-layer mm x (panel-relative, layout-dependent)", () => {
    const { page, warnings } = tp(`page { panel a { images { { "x.png" x: 10mm width: 40mm } } } }`);
    expect(firstPanel(page).attrs.imageLayers[0].x).toEqual({ value: 10, unit: "mm" });
    expect(warnings.join("")).toMatch(/panel width/);
  });

  it("--keep-coords skips coordinate mirroring", () => {
    const { page } = tp(`page { panel a { images { { "x.png" x: 10% width: 40% } } } }`, {
      keepCoords: true,
    });
    expect(firstPanel(page).attrs.imageLayers[0].x).toEqual({ value: 10, unit: "%" });
  });
});

describe("transpose — direction targeting", () => {
  it("--direction ltr on an already-ltr page is a no-op", () => {
    const src = `page { direction: ltr panel a { skew_left: 6 } } `;
    const { page } = tp(src, { direction: "ltr" });
    // untouched: skew stays 6 (not mirrored), matching the original AST.
    expect(JSON.stringify(page)).toBe(JSON.stringify(parse(src)));
  });

  it("--direction rtl on an ltr page mirrors (target differs)", () => {
    const { page } = tp(`page { direction: ltr panel a { skew_left: 6 } }`, { direction: "rtl" });
    expect(page.config.direction).toBe("rtl");
    expect(firstPanel(page).attrs.skewRight).toBe(-6);
  });
});

describe("transpose — text direction (opt-in)", () => {
  it("does NOT change text_direction by default", () => {
    const { page } = tp(`page { panel a { balloon { text: "x" text_direction: vertical } } }`);
    expect((firstPanel(page).speeches[0] as BalloonNode).attrs.textDirection).toBe("vertical");
  });

  it("--text swaps text_direction vertical↔horizontal", () => {
    const { page } = tp(`page { panel a { text: "hi" text_direction: vertical balloon { text: "x" text_direction: horizontal } } }`, {
      text: true,
    });
    const p = firstPanel(page);
    expect(p.attrs.textDirection).toBe("horizontal");
    expect((p.speeches[0] as BalloonNode).attrs.textDirection).toBe("vertical");
  });

  // Regression: a panel WITHOUT panel-level `text` (only speech text) must have
  // its speech text_direction flipped, and its own (unused, default) panel
  // textDirection left at the default — otherwise serialize emits a spurious
  // panel-level `text_direction`, and the speech flip looks like it did nothing.
  // (examples2/soseki_2.manga --text.)
  it("--text flips speech text_direction but not an unused panel default", () => {
    const { page } = tp(`page { panel a { images { { "x.png" } } monologue { text: "m" text_direction: vertical } } }`, {
      text: true,
    });
    const p = firstPanel(page);
    expect(p.attrs.textDirection).toBe("horizontal"); // unchanged default (no panel text)
    expect((p.speeches[0] as { attrs: { textDirection: string } }).attrs.textDirection).toBe(
      "horizontal",
    ); // vertical → horizontal
  });

  it("--text still flips panel text_direction when the panel HAS text", () => {
    const { page } = tp(`page { panel a { text: "t" text_direction: vertical } }`, { text: true });
    expect(firstPanel(page).attrs.textDirection).toBe("horizontal");
  });
});

describe("transpose — involution (twice == original)", () => {
  const cases: string[] = [
    `page { direction: rtl padding_left: 20 padding_right: 5
      col { row { panel a { skew_bottom: 8 offset_left: 3 border_left: 0.5
        images { { "x.png" anchor_pos: top_left x: 10% width: 40% dx: 2mm flip_h: true } }
        balloon { text: "hi" anchor_pos: top_right x: 60 width: 30 tail_angle: 90 align: start }
      } } row { panel b {} } } }`,
    `page { direction: ltr panel solo { skew_left: 3 skew_right: 7 } }`,
    `page { col { row { panel a {} } row { panel b {} } } }`,
  ];
  it.each(cases)("transpose∘transpose is identity (case %#)", (src) => {
    const opts = defaultTransposeOptions();
    const once = transposePage(parse(src), opts).page;
    const twice = transposePage(once, opts).page;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(parse(src)));
  });

  it("holds with --text as well", () => {
    const src = `page { direction: rtl panel a { text: "hi" text_direction: vertical } }`;
    const opts = { ...defaultTransposeOptions(), text: true };
    const twice = transposePage(transposePage(parse(src), opts).page, opts).page;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(parse(src)));
  });
});

describe("transpose — purity & serialize round-trip", () => {
  it("does not mutate its input page", () => {
    const page = parse(`page { direction: rtl panel a { skew_left: 6 } }`);
    const snapshot = JSON.stringify(page);
    transposePage(page, defaultTransposeOptions());
    expect(JSON.stringify(page)).toBe(snapshot);
  });

  it("produces serializable, re-parseable output", () => {
    const { page } = tp(`page { direction: rtl padding_left: 20 panel a { skew_bottom: 8
      balloon { text: "hi" x: 60 width: 30 align: start } } }`);
    const out = serialize(page);
    expect(() => parse(out)).not.toThrow();
    // round-trip stable
    expect(JSON.stringify(parse(serialize(parse(out))))).toBe(JSON.stringify(parse(out)));
  });
});
