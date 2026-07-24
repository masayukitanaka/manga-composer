import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { serialize } from "../../src/serialize.js";
import { ParseError } from "../../src/errors.js";
import { LayoutEngine } from "../../src/layout/slicing.js";
import { SVGRenderer } from "../../src/renderer/svg.js";
import { DEFAULT_FONT_STACK, type BalloonNode } from "../../src/ast.js";

function balloonAttrs(src: string) {
  const page = parse(src);
  const panel = page.children[0];
  if (panel.kind !== "panel") throw new Error("expected panel");
  const b = panel.speeches[0] as BalloonNode;
  return b.attrs;
}

function renderSvg(src: string): string {
  const page = parse(src);
  const engine = new LayoutEngine(page);
  const panels = engine.layout();
  return new SVGRenderer(page, panels, engine.speeches, null).render();
}

describe("font attrs — parsing", () => {
  it("parses font_family / letter_spacing / font_style / font_weight", () => {
    const a = balloonAttrs(`page { panel p {
      balloon {
        text: "hi"
        font_family: "Yu Gothic, sans-serif"
        letter_spacing: 0.4
        font_style: italic
        font_weight: bold
      }
    } }`);
    expect(a.fontFamily).toBe("Yu Gothic, sans-serif");
    expect(a.letterSpacing).toBe(0.4);
    expect(a.fontStyle).toBe("italic");
    expect(a.fontWeight).toBe("bold");
  });

  it("parses line_height as a unitless multiplier", () => {
    const a = balloonAttrs(`page { panel p { balloon { text: "x" line_height: 1.8 } } }`);
    expect(a.lineHeight).toEqual({ value: 1.8, unit: "%" });
  });

  it("parses line_height: 150% as multiplier 1.5", () => {
    const a = balloonAttrs(`page { panel p { balloon { text: "x" line_height: 150% } } }`);
    expect(a.lineHeight).toEqual({ value: 1.5, unit: "%" });
  });

  it("parses line_height in mm as absolute", () => {
    const a = balloonAttrs(`page { panel p { balloon { text: "x" line_height: 6mm } } }`);
    expect(a.lineHeight).toEqual({ value: 6, unit: "mm" });
  });

  it("rejects invalid font_style/font_weight", () => {
    expect(() => parse(`page { panel p { balloon { text: "x" font_style: oblique } } }`)).toThrow(
      ParseError,
    );
    expect(() => parse(`page { panel p { balloon { text: "x" font_weight: 700 } } }`)).toThrow(
      ParseError,
    );
  });

  it("rejects line_height in px and non-positive", () => {
    expect(() => parse(`page { panel p { balloon { text: "x" line_height: 10px } } }`)).toThrow(
      /line_height/,
    );
    expect(() => parse(`page { panel p { balloon { text: "x" line_height: 0 } } }`)).toThrow(
      /positive/,
    );
  });

  it("validates inline markup in text at parse time", () => {
    expect(() => parse(`page { panel p { balloon { text: "a<b>b" } } }`)).toThrow(ParseError);
  });

  it("also applies to monologue", () => {
    const page = parse(`page { panel p {
      monologue { text: "m" font_family: "serif" line_height: 2 }
    } }`);
    const panel = page.children[0];
    if (panel.kind !== "panel") throw new Error("panel");
    const m = panel.speeches[0];
    expect(m.attrs.fontFamily).toBe("serif");
    expect(m.attrs.lineHeight).toEqual({ value: 2, unit: "%" });
  });
});

describe("font attrs — rendering", () => {
  it("defaults to DEFAULT_FONT_STACK when font_family unset", () => {
    const svg = renderSvg(`page { panel p { balloon { text: "hi" } } }`);
    expect(svg).toContain(`font-family="${DEFAULT_FONT_STACK}"`);
  });

  it("uses the given font_family verbatim", () => {
    const svg = renderSvg(`page { panel p { balloon { text: "hi" font_family: "Arial, sans-serif" } } }`);
    expect(svg).toContain('font-family="Arial, sans-serif"');
  });

  it("emits letter-spacing on the horizontal <text>", () => {
    const svg = renderSvg(`page { panel p { balloon { text: "hello" letter_spacing: 0.5 } } }`);
    expect(svg).toMatch(/<text[^>]*letter-spacing="0.5"/);
  });

  it("splits <b>/<i> into decorated tspans (horizontal)", () => {
    const svg = renderSvg(`page { panel p { balloon { text: "a<b>B</b><i>c</i>" } } }`);
    expect(svg).toMatch(/<tspan[^>]*font-weight="bold"[^>]*>B<\/tspan>/);
    expect(svg).toMatch(/<tspan[^>]*font-style="italic"[^>]*>c<\/tspan>/);
  });

  it("decorates vertical glyphs per run", () => {
    const svg = renderSvg(`page { panel p {
      balloon { text: "あ<b>い</b>" text_direction: vertical }
    } }`);
    // The bold glyph 'い' should carry font-weight on its own <text>.
    expect(svg).toMatch(/<text[^>]*font-weight="bold"[^>]*>い<\/text>/);
  });

  it("element-wide font_style/font_weight apply without inline tags", () => {
    const svg = renderSvg(`page { panel p {
      balloon { text: "hi" font_style: italic font_weight: bold }
    } }`);
    expect(svg).toMatch(/<tspan[^>]*font-style="italic"/);
    expect(svg).toMatch(/<tspan[^>]*font-weight="bold"/);
  });

  it("auto-sizes the box wide enough to keep a long word intact (no mid-word break)", () => {
    // A long latin token mixed with CJK once caused "font_family" → "font_fami"/"ly".
    // The auto-estimated box must be wide enough that the word stays on one line.
    const svg = renderSvg(`page { panel p {
      monologue { text: "font_family と行間の指定。" }
    } }`);
    const tspans = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((m) => m[1]);
    expect(tspans).toContain("font_family");
    // The word is not split across two tspans.
    expect(tspans.some((t) => t === "font_fami")).toBe(false);
  });

  it("still hard-splits a word that exceeds an explicit width", () => {
    // When the user pins the width, a word longer than the line must still break.
    const svg = renderSvg(`page { panel p {
      monologue { text: "supercalifragilistic" width: 18 font_size: 4 }
    } }`);
    const tspans = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((m) => m[1]);
    expect(tspans.length).toBeGreaterThan(1);
    expect(tspans.join("")).toBe("supercalifragilistic");
  });
});

describe("wrap: false — author-controlled line breaks", () => {
  it("parses wrap and rejects non-boolean", () => {
    const a = balloonAttrs(`page { panel p { balloon { text: "x" wrap: false } } }`);
    expect(a.wrap).toBe(false);
    expect(() => parse(`page { panel p { balloon { text: "x" wrap: yes } } }`)).toThrow(
      /wrap must be true or false/,
    );
  });

  it("does NOT auto-wrap: a long line stays one line (even with a narrow box)", () => {
    // Same long text that auto-wrap would break into many lines.
    const svg = renderSvg(`page { panel p {
      monologue { text: "one two three four five six seven eight nine ten" wrap: false width: 20 }
    } }`);
    // One <text> with a single positioned line (one line = tspans that all
    // share y). Count distinct y values among the line-leading tspans.
    const yVals = [...svg.matchAll(/<tspan[^>]*\by="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(yVals).size).toBe(1); // exactly one line
  });

  it("still breaks at explicit \\n when wrap:false", () => {
    const svg = renderSvg(`page { panel p {
      monologue { text: "line one\nline two" wrap: false }
    } }`);
    const yVals = [...svg.matchAll(/<tspan[^>]*\by="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(yVals).size).toBe(2); // two lines from the \n
  });

  it("wrap:true (default) still auto-wraps the same long text", () => {
    const svg = renderSvg(`page { panel p {
      monologue { text: "one two three four five six seven eight nine ten" width: 20 }
    } }`);
    const yVals = [...svg.matchAll(/<tspan[^>]*\by="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(yVals).size).toBeGreaterThan(1); // wrapped into multiple lines
  });

  it("round-trips wrap", () => {
    const src = `page { panel p { monologue { text: "x" wrap: false } } }`;
    expect(parse(serialize(parse(src)))).toEqual(parse(src));
  });
});

describe("wrap: true — width-based wrapping & box sizing", () => {
  function boxRect(src: string) {
    const page = parse(src);
    const engine = new LayoutEngine(page);
    engine.layout();
    return engine.speeches[0].rect;
  }

  function lineCount(svg: string): number {
    const yVals = [...svg.matchAll(/<tspan[^>]*\by="([\d.]+)"/g)].map((m) => m[1]);
    return new Set(yVals).size;
  }

  it("fills the box width with Latin text instead of wrapping too early", () => {
    // ~20 chars of Latin at font_size 4 in a 100mm-wide box. Full-width would
    // fit ~24 chars/line and wrap this into several lines; proportional (~0.5×)
    // fits far more, so it should be a single line.
    const svg = renderSvg(`page { panel p {
      monologue { text: "hello world foo bar baz" width: 100 font_size: 4 padding: 2 }
    } }`);
    expect(lineCount(svg)).toBe(1);
  });

  it("explicit width + auto height sizes the box to the wrapped lines (no giant gap)", () => {
    // A long line that wraps to ~3 lines in a 150mm box. Height should be a few
    // line-heights, not the tall square estimate.
    const r = boxRect(`page { size: B5 padding: 10 row { panel c {
      monologue {
        text: "FRED STARTED OFF BY LISTING ALL THE TV AND FILM PROJECTS HE BELIEVED I'D MISSED DURING MY TIME IN NEW YORK"
        width: 150 padding: 10 font_size: 4.5
      }
    } } }`);
    // 3 text lines * 4.5 * 1.4 ≈ 19mm + padding 20 ≈ 39mm. Assert it's compact.
    expect(r.w).toBe(150);
    expect(r.h).toBeLessThan(50);
    expect(r.h).toBeGreaterThan(20);
  });
});

describe("vertical glyph placement (small kana, long vowel)", () => {
  function verticalGlyph(text: string, glyph: string): string | null {
    const svg = renderSvg(`page { panel p {
      balloon { text: "${text}" text_direction: vertical width: 12 height: 60 font_size: 6 }
    } }`);
    const re = new RegExp(`<text[^>]*>${glyph}</text>`);
    const m = svg.match(re);
    return m ? m[0] : null;
  }

  it("shrinks small kana (ゃゅょっ) and shifts them via a scale transform", () => {
    const g = verticalGlyph("しゃっく", "ゃ");
    expect(g).not.toBeNull();
    expect(g!).toMatch(/transform="translate\([^)]*\) scale\(0\.78\)"/);
  });

  it("does NOT scale a normal-size kana", () => {
    const g = verticalGlyph("しゃっく", "し");
    expect(g).not.toBeNull();
    expect(g!).not.toMatch(/scale/);
  });

  it("rotates the long-vowel mark about the column axis (pivot x = glyph x)", () => {
    // ー rotates 90°; pivot X must equal the glyph's own x (column center) so it
    // doesn't drift sideways.
    const g = verticalGlyph("あーん", "ー");
    expect(g).not.toBeNull();
    const x = Number(g!.match(/\bx="([\d.]+)"/)![1]);
    const pivotX = Number(g!.match(/rotate\(90 ([\d.]+) /)![1]);
    expect(pivotX).toBe(x);
  });

  it("rotates comparison symbols and brackets about the column axis (pivot x = glyph x)", () => {
    // ＞ and 「 both rotate; the pivot X must equal the glyph's x so they stay
    // centered on the column rather than drifting left/right.
    for (const [text, glyph] of [
      ["あ＞ん", "＞"],
      ["あ「ん", "「"],
    ] as const) {
      const g = verticalGlyph(text, glyph);
      expect(g, glyph).not.toBeNull();
      const x = Number(g!.match(/\bx="([\d.]+)"/)![1]);
      const pivotX = Number(g!.match(/rotate\(90 ([\d.]+) /)![1]);
      expect(pivotX, glyph).toBe(x);
    }
  });
});

describe("vertical text alignment follows anchor_pos", () => {
  // The text's baseline Y within a tall box: top_* hugs the top, bottom_* the
  // bottom, others center. (A tall explicit height exposes the difference.)
  function firstBaselineY(anchor: string): number {
    const svg = renderSvg(`page { size: B5 padding: 10
      row { panel c {
        monologue { anchor_pos: ${anchor} text: "HELLO" height: 120 width: 60 padding: 0 }
      } } }`);
    const m = svg.match(/<text[^>]*\by="([\d.]+)"/);
    if (!m) throw new Error("no <text>");
    return Number(m[1]);
  }

  it("top_* places text near the box top, bottom_* near the bottom, center in the middle", () => {
    const top = firstBaselineY("top_left");
    const mid = firstBaselineY("center");
    const bot = firstBaselineY("bottom_left");
    expect(top).toBeLessThan(mid);
    expect(mid).toBeLessThan(bot);
    // top should be near the panel top (y≈10 + font_size), not floating mid-box.
    expect(top).toBeLessThan(30);
  });
});

describe("font attrs — serialize round-trip", () => {
  function roundTrip(src: string) {
    const first = parse(src);
    expect(parse(serialize(first))).toEqual(first);
  }

  it("round-trips all font attrs (multiplier line_height)", () => {
    roundTrip(`page { panel p {
      balloon {
        text: "そ<b>れは</b><i>ダメ</i>"
        font_family: "Yu Gothic, sans-serif"
        line_height: 1.8
        letter_spacing: 0.4
        font_style: italic
        font_weight: bold
      }
    } }`);
  });

  it("round-trips mm line_height", () => {
    roundTrip(`page { panel p { monologue { text: "x" line_height: 6mm } } }`);
  });
});
