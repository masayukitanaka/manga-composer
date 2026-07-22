import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tokenize, type Token } from "../../src/lexer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = join(__dirname, "../../manga-gen-python");

function types(src: string): string[] {
  return tokenize(src).map((t) => t.type);
}

describe("lexer", () => {
  it("tokenizes structural chars", () => {
    expect(types("page { }")).toEqual(["IDENT", "LBRACE", "RBRACE", "EOF"]);
  });

  it("tokenizes a simple attribute", () => {
    const toks = tokenize("gutter: 5");
    expect(toks.map((t) => [t.type, t.value])).toEqual([
      ["IDENT", "gutter"],
      ["COLON", ":"],
      ["NUMBER", "5"],
      ["EOF", ""],
    ]);
  });

  it("distinguishes SIZE_VALUE from NUMBER", () => {
    expect(tokenize("420x297")[0]).toMatchObject({ type: "SIZE_VALUE", value: "420x297" });
    expect(tokenize("800x600px")[0]).toMatchObject({ type: "SIZE_VALUE", value: "800x600px" });
  });

  it("tokenizes PERCENTAGE", () => {
    expect(tokenize("40%")[0]).toMatchObject({ type: "PERCENTAGE", value: "40%" });
    expect(tokenize("50.5%")[0]).toMatchObject({ type: "PERCENTAGE", value: "50.5%" });
  });

  it("tokenizes negative and decimal NUMBER", () => {
    expect(tokenize("-16")[0]).toMatchObject({ type: "NUMBER", value: "-16" });
    expect(tokenize("40.5")[0]).toMatchObject({ type: "NUMBER", value: "40.5" });
  });

  it("keeps string quotes in the token value", () => {
    expect(tokenize('"#ffffff"')[0]).toMatchObject({ type: "STRING", value: '"#ffffff"' });
  });

  it("treats a unit word after a number as a separate IDENT", () => {
    expect(types("60mm")).toEqual(["NUMBER", "IDENT", "EOF"]);
  });

  it("skips line and block comments", () => {
    const src = `// leading\npage /* mid */ { }  // trailing`;
    expect(types(src)).toEqual(["IDENT", "LBRACE", "RBRACE", "EOF"]);
  });

  it("tracks line/col positions", () => {
    const toks = tokenize("page\n  gutter: 5");
    const gutter = toks.find((t: Token) => t.value === "gutter")!;
    expect(gutter.line).toBe(2);
    expect(gutter.col).toBe(3);
  });

  it("tokenizes every examples/ and examples2/ file without error", () => {
    for (const sub of ["examples", "examples2"] as const) {
      const dir = join(PY_ROOT, sub);
      const { readdirSync } = require("node:fs") as typeof import("node:fs");
      const files = readdirSync(dir).filter((f: string) => f.endsWith(".manga"));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const src = readFileSync(join(dir, f), "utf-8");
        expect(() => tokenize(src), `${sub}/${f}`).not.toThrow();
      }
    }
  });
});
