/**
 * The renderer's line wrapping (`_wrap_horizontal_styled`) and the layout
 * box-size estimate (`countWrappedLines`) MUST produce the same line count for
 * the same input, or the auto-sized speech box won't match the drawn text.
 * They now share one primitive (`wrapItems`); this test pins that invariant with
 * a deterministic fuzz over mixed CJK / Latin / spaces / newlines / long words.
 */

import { describe, it, expect } from "vitest";
import { countWrappedLines } from "../../src/layout/slicing.js";
import { _wrap_horizontal_styled, _style_chars } from "../../src/renderer/svg.js";

function renderLineCount(text: string, maxW: number, fs: number, ls = 0): number {
  const styled = _style_chars(text, { italic: false, bold: false });
  return _wrap_horizontal_styled(styled, maxW, fs, ls).length;
}

// Small deterministic PRNG so the fuzz is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("wrap line-count parity (render vs estimate)", () => {
  const fixed = [
    "hello world foo bar baz",
    "これは日本語のテキストです",
    "mixed 日本語 and english text",
    "word\nwith\nnewlines",
    "supercalifragilisticexpialidocious short",
    "a b c d e f g h i j k l m n o p",
    "",
    "\n\n",
    "one",
    "ぁぃぅ ゃゅょ ー「」テスト",
  ];
  for (const text of fixed) {
    for (const maxW of [10, 20, 40, 80]) {
      it(`fixed: ${JSON.stringify(text)} @ ${maxW}mm`, () => {
        expect(renderLineCount(text, maxW, 4)).toBe(countWrappedLines(text, maxW, 4));
      });
    }
  }

  it("fuzz: 500 random strings agree", () => {
    const rnd = mulberry32(12345);
    const alphabet = "ab cd efg hi 日本 語 テ ー \n xyz longword ";
    for (let n = 0; n < 500; n++) {
      const len = 1 + Math.floor(rnd() * 40);
      let text = "";
      for (let i = 0; i < len; i++) {
        text += alphabet[Math.floor(rnd() * alphabet.length)];
      }
      const maxW = 5 + Math.floor(rnd() * 60);
      const fs = 3 + Math.floor(rnd() * 5);
      const ls = rnd() < 0.3 ? Number((rnd() * 1.5).toFixed(2)) : 0;
      const rc = renderLineCount(text, maxW, fs, ls);
      const ec = countWrappedLines(text, maxW, fs, ls);
      expect(rc, `mismatch for ${JSON.stringify(text)} @ ${maxW}mm fs=${fs} ls=${ls}`).toBe(ec);
    }
  });

  it("wrap disabled (max_width = Infinity): one line per paragraph", () => {
    expect(renderLineCount("a b c\nd e f", Infinity, 4)).toBe(2);
    expect(countWrappedLines("a b c\nd e f", Infinity, 4)).toBe(2);
  });
});
