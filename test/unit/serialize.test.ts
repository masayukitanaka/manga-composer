/**
 * Round-trip property test for serialize().
 *
 * The guarantee (docs/SPEC.md §3.3): serializing a parsed Page and re-parsing it
 * yields an equivalent AST. We assert this over every bundled example .manga file
 * plus a set of hand-written cases that exercise attribute defaults, nesting,
 * balloons/monologues, named pages, and custom sizes.
 *
 * We compare parse(src) with parse(serialize(parse(src))) — NOT the raw text —
 * because serialize emits a canonical form (defaults omitted, attrs reordered),
 * which is exactly what a lossless-AST round-trip should allow.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "../../src/parser.js";
import { serialize } from "../../src/serialize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "../..");

/** parse → serialize → parse must deep-equal the first parse. */
function assertRoundTrip(src: string): void {
  const first = parse(src);
  const text = serialize(first);
  let second;
  try {
    second = parse(text);
  } catch (e) {
    throw new Error(
      `re-parse failed: ${String(e)}\n--- serialized ---\n${text}`,
    );
  }
  expect(second, `AST mismatch after round-trip.\n--- serialized ---\n${text}`).toEqual(first);
}

describe("serialize round-trip", () => {
  for (const sub of ["examples", "examples2"]) {
    const dir = join(PKG_ROOT, sub);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".manga"));
    for (const f of files) {
      it(`${sub}/${f}`, () => {
        assertRoundTrip(readFileSync(join(dir, f), "utf-8"));
      });
    }
  }

  const cases: Record<string, string> = {
    "single panel": `page { panel hero }`,
    "named page": `page main_layout { panel a }`,
    "custom size": `page { size: 150x200\n panel a }`,
    "custom size px": `page { size: 800x600px\n panel a }`,
    "row height %": `page { row height: 40% { panel a } row { panel b } }`,
    "col width mm": `page { row { col width: 60mm { panel a } col { panel b } } }`,
    "panel inline attrs": `page { panel hero importance: 1, border: 2 }`,
    "panel border overrides": `page { border: 2\n panel a { border: 3 }\n panel b }`,
    "individual borders": `page { panel a { border_top: 0\n border_bottom: 2 } }`,
    "skew + offset": `page { panel a { skew_left: 8\n offset_top: -10 } }`,
    "gutter color flashback": `page { gutter_color: black\n panel a }`,
    "balloon shout": `page { panel a { balloon { text: "wow"\n shape: shout\n tail_angle: 200 } } }`,
    "monologue caption": `page { panel a { monologue { text: "later"\n background: "#000000"\n text_color: "#ffffff"\n x: 10\n y: 10 } } }`,
    "balloon with id": `page { panel a { balloon b1 { text: "hi" } } }`,
    "nested cols and rows": `page { row height: 50% { col width: 60% { panel main { importance: 1 } } col { row { panel s1 } row { panel s2 } } } row { panel bottom } }`,
    "rtl direction": `page { direction: rtl\n panel a }`,
  };

  for (const [name, src] of Object.entries(cases)) {
    it(name, () => assertRoundTrip(src));
  }
});
