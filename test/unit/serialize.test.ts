/**
 * Round-trip property test for serialize().
 *
 * The guarantee (.private/SPEC.md §3.3): serializing a parsed Page and re-parsing it
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
import {
  PAGE_ATTR_KEYS,
  PANEL_ATTR_KEYS,
  BALLOON_ATTR_KEYS,
  MONOLOGUE_ATTR_KEYS,
  IMAGE_LAYER_ATTR_KEYS,
} from "../../src/ast.js";

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

/**
 * Exhaustiveness guard: for EVERY DSL attribute the parser accepts (the
 * `*_ATTR_KEYS` sets are the single source of allowed keys), set it to a
 * non-default value and assert it survives parse → serialize → parse.
 *
 * This catches the "attribute added to ast.ts + parser but forgotten in
 * serialize.ts" hazard — such an attr is silently dropped on round-trip, which
 * the fixture-based tests only catch by luck. Iterating over the key sets means
 * a newly-added attribute is covered automatically: if it has no value here the
 * test fails loudly (register it), and if serialize forgets it the round-trip
 * assertion fails.
 */
describe("serialize round-trip — attribute exhaustiveness", () => {
  // A non-default DSL value + a page/panel wrapper for each attribute, per scope.
  // `wrap(v)` builds a full .manga document exercising `<key>: <v>`.
  type Case = { value: string; wrap: (kv: string) => string };

  const pageCases: Record<string, Case> = {
    size: { value: "B5", wrap: (kv) => `page { ${kv}\n panel a }` },
    direction: { value: "rtl", wrap: (kv) => `page { ${kv}\n panel a }` },
    gutter: { value: "8", wrap: (kv) => `page { ${kv}\n panel a }` },
    padding: { value: "20", wrap: (kv) => `page { ${kv}\n panel a }` },
    padding_top: { value: "12", wrap: (kv) => `page { ${kv}\n panel a }` },
    padding_bottom: { value: "13", wrap: (kv) => `page { ${kv}\n panel a }` },
    padding_left: { value: "14", wrap: (kv) => `page { ${kv}\n panel a }` },
    padding_right: { value: "15", wrap: (kv) => `page { ${kv}\n panel a }` },
    background: { value: `"#eeeeee"`, wrap: (kv) => `page { ${kv}\n panel a }` },
    gutter_color: { value: "black", wrap: (kv) => `page { ${kv}\n panel a }` },
    dpi: { value: "600", wrap: (kv) => `page { ${kv}\n panel a }` },
    border: { value: "0.5", wrap: (kv) => `page { ${kv}\n panel a }` },
    border_color: { value: `"#112233"`, wrap: (kv) => `page { ${kv}\n panel a }` },
  };

  // Panel wrapper: keep the page border/color at defaults so a panel border
  // value differs from the page-resolved default and is actually emitted.
  const panelWrap = (kv: string) => `page { panel a { ${kv} } }`;
  const panelCases: Record<string, Case> = {
    importance: { value: "1", wrap: panelWrap },
    z_index: { value: "5", wrap: panelWrap },
    image: { value: `"x.png"`, wrap: panelWrap },
    image_fit: { value: "contain", wrap: (kv) => `page { panel a { image: "x.png" ${kv} } }` },
    image_clip: { value: "false", wrap: panelWrap },
    label: { value: `"L"`, wrap: panelWrap },
    description: { value: `"a note"`, wrap: panelWrap },
    show_description: { value: "true", wrap: panelWrap },
    text: { value: `"hi"`, wrap: panelWrap },
    text_direction: { value: "vertical", wrap: panelWrap },
    border: { value: "3", wrap: panelWrap },
    border_color: { value: `"#445566"`, wrap: panelWrap },
    border_top: { value: "0", wrap: panelWrap },
    border_bottom: { value: "2", wrap: panelWrap },
    border_left: { value: "0", wrap: panelWrap },
    border_right: { value: "2", wrap: panelWrap },
    background: { value: `"#f0f0f0"`, wrap: panelWrap },
    skew_left: { value: "8", wrap: panelWrap },
    skew_right: { value: "-8", wrap: panelWrap },
    skew_top: { value: "5", wrap: panelWrap },
    skew_bottom: { value: "5", wrap: panelWrap },
    offset_top: { value: "-10", wrap: panelWrap },
    offset_bottom: { value: "-10", wrap: panelWrap },
    offset_left: { value: "-5", wrap: panelWrap },
    offset_right: { value: "-5", wrap: panelWrap },
  };

  const balloonWrap = (kv: string) => `page { panel a { balloon { text: "hi" ${kv} } } }`;
  const speechShared: Record<string, Case> = {
    text: { value: `"different"`, wrap: balloonWrap },
    text_direction: { value: "vertical", wrap: balloonWrap },
    font_size: { value: "6", wrap: balloonWrap },
    font_family: { value: `"Arial, sans-serif"`, wrap: balloonWrap },
    line_height: { value: "1.8", wrap: balloonWrap },
    letter_spacing: { value: "0.4", wrap: balloonWrap },
    font_style: { value: "italic", wrap: balloonWrap },
    font_weight: { value: "bold", wrap: balloonWrap },
    wrap: { value: "false", wrap: balloonWrap },
    padding: { value: "4", wrap: balloonWrap },
    x: { value: "10", wrap: balloonWrap },
    y: { value: "10", wrap: balloonWrap },
    width: { value: "40", wrap: balloonWrap },
    height: { value: "20", wrap: balloonWrap },
    anchor_pos: { value: "bottom_left", wrap: balloonWrap },
    margin: { value: "1", wrap: balloonWrap },
    dx: { value: "2", wrap: balloonWrap },
    dy: { value: "3", wrap: balloonWrap },
    z_index: { value: "7", wrap: balloonWrap },
    background: { value: `"#101010"`, wrap: balloonWrap },
    border_color: { value: `"#202020"`, wrap: balloonWrap },
    border: { value: "1", wrap: balloonWrap },
    align: { value: "center", wrap: balloonWrap },
  };
  const balloonCases: Record<string, Case> = {
    ...speechShared,
    shape: { value: "shout", wrap: balloonWrap },
    aspect_ratio: { value: "2", wrap: balloonWrap },
    corner_radius: { value: "5", wrap: balloonWrap },
    inner_ratio: { value: "0.5", wrap: balloonWrap },
    jitter: { value: "0.5", wrap: balloonWrap },
    tail_angle: { value: "200", wrap: balloonWrap },
    tail_length: { value: "8", wrap: balloonWrap },
  };

  const monoWrap = (kv: string) => `page { panel a { monologue { text: "hi" ${kv} } } }`;
  const monologueCases: Record<string, Case> = {
    ...Object.fromEntries(
      Object.entries(speechShared).map(([k, c]) => [k, { ...c, wrap: monoWrap }]),
    ),
    text_color: { value: `"#ffffff"`, wrap: monoWrap },
  };

  const layerWrap = (kv: string) => `page { panel a { images { { "x.png" ${kv} } } } }`;
  const imageLayerCases: Record<string, Case> = {
    path: { value: "", wrap: () => `page { panel a { images { { "y.png" } } } }` },
    image_fit: { value: "contain", wrap: layerWrap },
    anchor_pos: { value: "bottom_right", wrap: layerWrap },
    x: { value: "10%", wrap: layerWrap },
    y: { value: "5mm", wrap: layerWrap },
    width: { value: "60%", wrap: layerWrap },
    height: { value: "90%", wrap: layerWrap },
    dx: { value: "2mm", wrap: layerWrap },
    dy: { value: "1%", wrap: layerWrap },
    clip: { value: "false", wrap: layerWrap },
    flip_h: { value: "true", wrap: layerWrap },
  };

  const scopes: [string, ReadonlySet<string>, Record<string, Case>][] = [
    ["page", PAGE_ATTR_KEYS, pageCases],
    ["panel", PANEL_ATTR_KEYS, panelCases],
    ["balloon", BALLOON_ATTR_KEYS, balloonCases],
    ["monologue", MONOLOGUE_ATTR_KEYS, monologueCases],
    ["image layer", IMAGE_LAYER_ATTR_KEYS, imageLayerCases],
  ];

  for (const [scope, keys, cases] of scopes) {
    describe(scope, () => {
      for (const key of keys) {
        it(`round-trips non-default ${key}`, () => {
          const c = cases[key];
          // If this throws, a new attribute was added without a test value here.
          expect(c, `no exhaustiveness value registered for ${scope}.${key}`).toBeDefined();
          // `path` is special (bare string, no `key: value` form) — its wrap
          // ignores the kv and uses a bare path.
          const kv = key === "path" ? "" : `${key}: ${c.value}`;
          assertRoundTrip(c.wrap(kv));
        });
      }
    });
  }
});
