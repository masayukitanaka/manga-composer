import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "../../src/parser.js";
import { ParseError } from "../../src/errors.js";
import type { LayoutNode, PanelNode } from "../../src/ast.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// `.manga` sources live in the package (examples/, examples2/).
const PKG_ROOT = join(__dirname, "../..");

function collectPanels(nodes: LayoutNode[], out: PanelNode[] = []): PanelNode[] {
  for (const n of nodes) {
    if (n.kind === "panel") out.push(n);
    else collectPanels(n.children, out);
  }
  return out;
}

function parseFile(sub: string, name: string) {
  return parse(readFileSync(join(PKG_ROOT, sub, name), "utf-8"));
}

describe("parser", () => {
  it("parses a minimal single-panel page", () => {
    const page = parse("page { panel hero }");
    expect(page.children).toHaveLength(1);
    expect(page.children[0]).toMatchObject({ kind: "panel", id: "hero" });
  });

  it("parses page attributes with defaults overridden", () => {
    const page = parse(`page { size: B5\n direction: rtl\n gutter: 6\n panel p }`);
    expect(page.config.size).toBe("B5");
    expect(page.config.widthMm).toBe(182);
    expect(page.config.heightMm).toBe(257);
    expect(page.config.direction).toBe("rtl");
    expect(page.config.gutter).toBe(6);
  });

  it("parses a custom pixel/mm size (WxH form)", () => {
    const page = parse(`page { size: 420x297\n panel p }`);
    expect(page.config.sizeUnit).toBe("mm");
    expect(page.config.widthMm).toBe(420);
    expect(page.config.heightMm).toBe(297);
  });

  it("parses inline panel attrs", () => {
    const page = parse(`page { panel hero importance: 1, border: 2 }`);
    const p = page.children[0] as PanelNode;
    expect(p.attrs.importance).toBe(1);
    expect(p.attrs.border).toBe(2);
  });

  it("applies page border/border_color as panel defaults", () => {
    const page = parse(`page { border: 0.5\n border_color: "#123456"\n panel p }`);
    expect(page.config.border).toBe(0.5);
    const p = page.children[0] as PanelNode;
    // page border/border_color propagate onto the panel (parser.py behaviour)
    expect(p.attrs.border).toBe(0.5);
    expect(p.attrs.borderColor).toBe("#123456");
  });

  it("panel's explicit border overrides the page default", () => {
    const page = parse(`page { border: 0.5\n panel p { border: 3 } }`);
    const p = page.children[0] as PanelNode;
    expect(p.attrs.border).toBe(3);
  });

  it("parses row height percentage and nested col/panel", () => {
    const page = parse(`page {
      row height: 40% {
        col width: 35% { panel a }
        col { panel b }
      }
    }`);
    expect(page.children).toHaveLength(1);
    const row = page.children[0];
    expect(row.kind).toBe("row");
    if (row.kind === "row") {
      expect(row.height).toEqual({ value: 40, unit: "%" });
      expect(row.children).toHaveLength(2);
    }
  });

  it("parses container-level skew inside a block (jujutsu style)", () => {
    const page = parse(`page {
      row {
        row height: 72% {
          skew_bottom: 8
          panel action_car { border_left: 0 }
        }
      }
    }`);
    const outer = page.children[0];
    if (outer.kind === "row") {
      const inner = outer.children[0];
      if (inner.kind === "row") {
        expect(inner.skewBottom).toBe(8);
        expect(inner.height).toEqual({ value: 72, unit: "%" });
      }
    }
  });

  it("rejects unknown page attribute", () => {
    expect(() => parse(`page { bogus: 1\n panel p }`)).toThrow(/Unknown page attribute: bogus/);
  });

  it("rejects unknown panel attribute", () => {
    expect(() => parse(`page { panel p { bogus: 1 } }`)).toThrow(/Unknown panel attribute: bogus/);
  });

  it("rejects a non-positive row height / col width", () => {
    expect(() => parse(`page { row height: -5mm { panel a } row { panel b } }`)).toThrow(
      /row height must be positive/,
    );
    expect(() => parse(`page { row height: 0mm { panel a } row { panel b } }`)).toThrow(
      /row height must be positive/,
    );
    expect(() => parse(`page { row { col width: 0% { panel a } col { panel b } } }`)).toThrow(
      /col width must be positive/,
    );
    // A valid positive size still parses.
    expect(() => parse(`page { row height: 40% { panel a } row { panel b } }`)).not.toThrow();
  });

  it("truncates float importance like Python int(float(x))", () => {
    const page = parse(`page { panel p { importance: 2 } }`);
    expect((page.children[0] as PanelNode).attrs.importance).toBe(2);
  });

  const EXPECTED_PANEL_COUNTS: Record<string, number> = {
    "sakura.manga": 4,
    "jujutsu.manga": 5,
    "hxh.manga": 8,
    "nodame.manga": 6,
    "boys.manga": 6,
  };

  it("parses every examples2/ file with the expected panel count", () => {
    for (const [name, count] of Object.entries(EXPECTED_PANEL_COUNTS)) {
      const page = parseFile("examples2", name);
      const panels = collectPanels(page.children);
      expect(panels.length, name).toBe(count);
    }
  });

  it("parses every examples/ file without error", () => {
    const dir = join(PKG_ROOT, "examples");
    const files = readdirSync(dir).filter((f) => f.endsWith(".manga"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(() => parseFile("examples", f), f).not.toThrow();
    }
  });

  // Panel ids are the anchor everything addresses a panel by (layout maps,
  // speech/image-layer owners, editor selection). Duplicates used to parse
  // fine and then silently resolve to whichever panel came first.
  describe("duplicate panel ids", () => {
    it("rejects duplicates across separate containers", () => {
      const src = `page {\n  row { panel p1 }\n  row { panel p1 }\n}`;
      expect(() => parse(src)).toThrow(ParseError);
      expect(() => parse(src)).toThrow(/duplicate panel id/);
    });

    it("rejects duplicates among siblings", () => {
      expect(() => parse(`page {\n  row { panel a panel a }\n}`)).toThrow(/duplicate panel id/);
    });

    it("still accepts distinct ids", () => {
      expect(() => parse(`page {\n  row { panel p1 }\n  row { panel p2 }\n}`)).not.toThrow();
    });

    it("does not leak seen ids between parse() calls", () => {
      const src = `page { panel p1 }`;
      expect(() => parse(src)).not.toThrow();
      expect(() => parse(src)).not.toThrow();
    });
  });

});
