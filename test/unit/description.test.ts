import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { serialize } from "../../src/serialize.js";
import { ParseError } from "../../src/errors.js";
import { LayoutEngine } from "../../src/layout/slicing.js";
import { SVGRenderer } from "../../src/renderer/svg.js";
import type { PanelNode } from "../../src/ast.js";
import type { ImageLoader } from "../../src/renderer/imageLoader.js";

const stubLoader: ImageLoader = () => ({ dataBase64: "AAAA", mime: "image/png" });

function panel0(src: string): PanelNode {
  const p = parse(src).children[0];
  if (p.kind !== "panel") throw new Error("expected panel");
  return p;
}

function renderSvg(src: string): string {
  const page = parse(src);
  const engine = new LayoutEngine(page);
  const panels = engine.layout();
  return new SVGRenderer(page, panels, engine.speeches, stubLoader).render();
}

describe("panel description — parsing", () => {
  it("parses description + show_description", () => {
    const a = panel0(`page { panel p { description: "a note" show_description: true } }`).attrs;
    expect(a.description).toBe("a note");
    expect(a.showDescription).toBe(true);
  });

  it("defaults show_description to false and description to null", () => {
    const a = panel0(`page { panel p {} }`).attrs;
    expect(a.description).toBeNull();
    expect(a.showDescription).toBe(false);
  });

  it("rejects a non-boolean show_description", () => {
    expect(() => parse(`page { panel p { show_description: yes } }`)).toThrow(
      /show_description must be true or false/,
    );
  });
});

describe("panel description — rendering", () => {
  it("shows the description when show_description is true and there are no images", () => {
    const svg = renderSvg(`page { panel p {
      description: "DESCTEXT" show_description: true
    } }`);
    expect(svg).toContain("DESCTEXT");
    expect(svg).toMatch(/<text[^>]*fill="#999999"/);
  });

  it("does NOT show the description when show_description is false", () => {
    const svg = renderSvg(`page { panel p { description: "DESCTEXT" } }`);
    expect(svg).not.toContain("DESCTEXT");
  });

  it("does NOT show the description when the panel has an image (sugar)", () => {
    const svg = renderSvg(`page { panel p {
      description: "DESCTEXT" show_description: true image: "x.png"
    } }`);
    expect(svg).not.toContain("DESCTEXT");
  });

  it("does NOT show the description when the panel has an images block", () => {
    const svg = renderSvg(`page { panel p {
      description: "DESCTEXT" show_description: true
      images { { "x.png" } }
    } }`);
    expect(svg).not.toContain("DESCTEXT");
  });

  it("does nothing when show_description is true but description is empty", () => {
    const svg = renderSvg(`page { panel p { show_description: true } }`);
    // No description text; only the panel border rect(s) exist.
    expect(svg).not.toMatch(/<text[^>]*fill="#999999"/);
  });
});

describe("panel description — serialize round-trip", () => {
  it("round-trips description + show_description", () => {
    const src = `page { panel p { description: "a\\nb" show_description: true } }`;
    const first = parse(src);
    expect(parse(serialize(first))).toEqual(first);
  });
});
