import { describe, it, expect } from "vitest";
import { parseRichText, plainText } from "../../src/renderer/richtext.js";
import { ParseError } from "../../src/errors.js";

const base = { italic: false, bold: false };

describe("parseRichText", () => {
  it("returns a single plain run for text with no tags", () => {
    expect(parseRichText("hello", base)).toEqual([{ text: "hello", italic: false, bold: false }]);
  });

  it("splits <b> into runs", () => {
    expect(parseRichText("a<b>B</b>c", base)).toEqual([
      { text: "a", italic: false, bold: false },
      { text: "B", italic: false, bold: true },
      { text: "c", italic: false, bold: false },
    ]);
  });

  it("nests <b><i>…</i></b>", () => {
    expect(parseRichText("<b>x<i>y</i>z</b>", base)).toEqual([
      { text: "x", italic: false, bold: true },
      { text: "y", italic: true, bold: true },
      { text: "z", italic: false, bold: true },
    ]);
  });

  it("is case-insensitive", () => {
    expect(parseRichText("<I>hi</I>", base)).toEqual([{ text: "hi", italic: true, bold: false }]);
  });

  it("ORs the element-wide base with tags", () => {
    // base italic, <b> adds bold
    expect(parseRichText("<b>x</b>", { italic: true, bold: false })).toEqual([
      { text: "x", italic: true, bold: true },
    ]);
  });

  it("treats \\< as a literal '<'", () => {
    expect(parseRichText("a\\<b", base)).toEqual([{ text: "a<b", italic: false, bold: false }]);
  });

  it("throws on an unclosed tag", () => {
    expect(() => parseRichText("a<b>b", base)).toThrow(ParseError);
  });

  it("throws on a stray closing tag", () => {
    expect(() => parseRichText("a</b>", base)).toThrow(ParseError);
  });

  it("throws on crossed nesting", () => {
    expect(() => parseRichText("<b><i>x</b></i>", base)).toThrow(/Mismatched/);
  });

  it("throws on an unknown tag", () => {
    expect(() => parseRichText("<u>x</u>", base)).toThrow(/only <i> and <b>/);
  });

  it("throws on a malformed '<'", () => {
    expect(() => parseRichText("a < b", base)).toThrow(/Invalid inline tag/);
  });
});

describe("plainText", () => {
  it("strips tags and keeps text length correct", () => {
    expect(plainText("そ<b>れは</b><i>ダメ</i>")).toBe("それはダメ");
    expect(plainText("そ<b>れは</b><i>ダメ</i>").length).toBe(5);
  });

  it("reduces \\< to <", () => {
    expect(plainText("a\\<b")).toBe("a<b");
  });
});
