/**
 * Corner-case coverage for the skewed-panel renderer (_render_skewed_panel).
 *
 * The golden SVG references (compile.test.ts) only exercise the skew geometries
 * that the example fixtures happen to reach, so individual branches of
 * _render_skewed_panel can silently break during a refactor. This test drives
 * every branch of the polygon-corner and border-line logic with a minimal .manga
 * snippet, then snapshots the exact `<polygon>`/`<line>` coordinates it emits.
 *
 * The snapshots are the CURRENT (correct) output frozen in place — not
 * hand-computed values. They are the safety net for splitting the 358-line
 * method (#4b): if any corner coordinate changes, a snapshot diff flags it.
 *
 * Branch map (see probe in the PR notes):
 *   isolated own skew_left/right/top/bottom/all → own-skew polygon+border paths,
 *     all draw_* true, no shared_* state.
 *   col skew_right → shared left/right skewline (Lsk/Rsk + Lx/Rx).
 *   row skew_bottom/top → shared top/bottom skewline + endpoints (Bsk/Tsk + ep).
 *   corner → the SkewHLine×SkewLine intersection branch (Rsk+Bsk, Lsk, Tsk).
 */

import { describe, it, expect } from "vitest";
import { compileToSvg } from "../../src/index.js";

/** Extract the polygon point strings and border line coords from an SVG. */
function skewShapes(svg: string): { polys: string[]; lines: string[] } {
  const polys = [...svg.matchAll(/<polygon points="([^"]*)"/g)].map((m) => m[1]);
  const lines = [...svg.matchAll(/<line ([^>]*)\/>/g)].map((m) => {
    const a = m[1];
    const g = (k: string): string => new RegExp(`${k}="([^"]*)"`).exec(a)?.[1] ?? "";
    return `${g("x1")},${g("y1")} ${g("x2")},${g("y2")} w=${g("stroke-width")}`;
  });
  return { polys, lines };
}

function shapes(src: string): { polys: string[]; lines: string[] } {
  return skewShapes(compileToSvg(src, "."));
}

describe("skewed-panel rendering — corner cases (frozen output)", () => {
  it("isolated own skew_left", () => {
    expect(shapes(`page { padding:5 border:1 row { panel a { skew_left: 10 } } }`))
      .toMatchInlineSnapshot(`
        {
          "lines": [
            "-20.302921731664725,5 30.302921731664725,292 w=1",
            "205,5 205,292 w=1",
            "-20.302921731664725,5 205,5 w=1",
            "30.302921731664725,292 205,292 w=1",
          ],
          "polys": [
            "-20.302921731664725,5 205,5 205,292 30.302921731664725,292",
          ],
        }
      `);
  });

  it("isolated own skew_right", () => {
    expect(shapes(`page { padding:5 border:1 row { panel a { skew_right: -10 } } }`))
      .toMatchInlineSnapshot(`
        {
          "lines": [
            "5,5 5,292 w=1",
            "179.69707826833528,5 230.30292173166472,292 w=1",
            "5,5 179.69707826833528,5 w=1",
            "5,292 230.30292173166472,292 w=1",
          ],
          "polys": [
            "5,5 179.69707826833528,5 230.30292173166472,292 5,292",
          ],
        }
      `);
  });

  it("isolated own skew_top", () => {
    expect(shapes(`page { padding:5 border:1 row { panel a { skew_top: 10 } } }`))
      .toMatchInlineSnapshot(`
        {
          "lines": [
            "5,5 5,292 w=1",
            "205,5 205,292 w=1",
            "5,-12.632698070846498 205,22.632698070846498 w=1",
            "5,292 205,292 w=1",
          ],
          "polys": [
            "5,5 105,5 205,22.632698070846498 205,292 5,292",
          ],
        }
      `);
  });

  it("isolated own skew_bottom", () => {
    expect(shapes(`page { padding:5 border:1 row { panel a { skew_bottom: 10 } } }`))
      .toMatchInlineSnapshot(`
        {
          "lines": [
            "5,5 5,292 w=1",
            "205,5 205,292 w=1",
            "5,5 205,5 w=1",
            "5,292 205,292 w=1",
          ],
          "polys": [
            "5,5 205,5 205,292 105,292 5,274.3673019291535",
          ],
        }
      `);
  });

  it("isolated own all four skews", () => {
    expect(
      shapes(
        `page { padding:5 border:1 row { panel a { skew_left: 8 skew_right: 8 skew_top: 5 skew_bottom: 5 } } }`,
      ),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "-15.167609779793175,-3.748866352592401 25.167609779793175,283.2511336474076 w=1",
          "225.16760977979317,13.748866352592401 184.83239022020683,300.7488663525924 w=1",
          "-15.167609779793175,-3.748866352592401 225.16760977979317,13.748866352592401 w=1",
          "25.167609779793175,283.2511336474076 184.83239022020683,300.7488663525924 w=1",
        ],
        "polys": [
          "-13.93803679990016,5.000000000000057 105,5 225.16760977979317,13.748866352592401 186.06196320009985,291.99999999999994 105,292 25.167609779793175,283.2511336474076",
        ],
      }
    `);
  });

  it("col skew_right — shared left/right skewline (two parallel diagonals)", () => {
    expect(
      shapes(`page { padding:5 border:1 row { col { skew_right: -6 panel L {} } col { panel R {} } } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "5,5 5,292 w=1",
          "117.58245776062458,5 87.41754223937542,292 w=1",
          "5,5 117.58245776062458,5 w=1",
          "5,292 87.41754223937542,292 w=1",
          "122.58245776062458,5 92.41754223937542,292 w=1",
          "205,5 205,292 w=1",
          "122.58245776062458,5 205,5 w=1",
          "92.41754223937542,292 205,292 w=1",
        ],
        "polys": [
          "5,5 117.58245776062458,5 87.41754223937542,292 5,292",
          "122.58245776062458,5 205,5 205,292 92.41754223937542,292",
        ],
      }
    `);
  });

  it("row skew_bottom — shared top/bottom skewline + endpoints", () => {
    expect(
      shapes(`page { padding:5 border:1 col { row { skew_bottom: 10 panel T {} } row { panel B {} } } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "5,5 5,128.3673019291535 w=1",
          "205,5 205,163.6326980708465 w=1",
          "5,5 205,5 w=1",
          "5,128.3673019291535 205,163.6326980708465 w=1",
          "5,133.3673019291535 5,292 w=1",
          "205,168.6326980708465 205,292 w=1",
          "5,133.3673019291535 205,168.6326980708465 w=1",
          "5,292 205,292 w=1",
        ],
        "polys": [
          "5,5 205,5 205,163.6326980708465 5,128.3673019291535",
          "5,133.3673019291535 205,168.6326980708465 205,292 5,292",
        ],
      }
    `);
  });

  it("row skew_top — shared skewline set from the bottom panel's own skew", () => {
    expect(
      shapes(`page { padding:5 border:1 col { row { panel T {} } row { skew_top: 10 panel B {} } } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "5,5 5,128.3673019291535 w=1",
          "205,5 205,163.6326980708465 w=1",
          "5,5 205,5 w=1",
          "5,128.3673019291535 205,163.6326980708465 w=1",
          "5,133.3673019291535 5,292 w=1",
          "205,168.6326980708465 205,292 w=1",
          "5,133.3673019291535 205,168.6326980708465 w=1",
          "5,292 205,292 w=1",
        ],
        "polys": [
          "5,5 205,5 205,163.6326980708465 5,128.3673019291535",
          "5,133.3673019291535 205,168.6326980708465 205,292 5,292",
        ],
      }
    `);
  });

  it("corner: skew_bottom horizontal gutter × col skew vertical gutter (intersection)", () => {
    expect(
      shapes(
        `page { padding:5 border:1 col { row { col { skew_right: 8 panel TL { skew_bottom: 10 } } col { panel TR {} } } row { panel Bot {} } } }`,
      ),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "5,5 5,137.40405969046233 w=1",
          "92.5918711534814,5 113.89868181449425,156.60583545794393 w=1",
          "5,5 92.5918711534814,5 w=1",
          "5,137.40405969046233 113.89868181449425,156.60583545794393 w=1",
          "97.5918711534814,5 117.4081288465186,146 w=1",
          "205,5 205,146 w=1",
          "97.5918711534814,5 205,5 w=1",
          "117.4081288465186,146 205,146 w=1",
        ],
        "polys": [
          "5,5 92.5918711534814,5 112.4081288465186,156.34301075351473 5,137.40405969046233",
          "97.5918711534814,5 205,5 205,146 117.4081288465186,146",
        ],
      }
    `);
  });

  // Per-side border widths on a skewed panel: the individual border_* control
  // must combine with skew geometry (a hidden side draws no line).
  it("skewed panel with a hidden side (border_top: 0)", () => {
    expect(
      shapes(`page { padding:5 border:1 row { panel a { skew_left: 10 border_top: 0 } } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "-20.302921731664725,5 30.302921731664725,292 w=1",
          "205,5 205,292 w=1",
          "30.302921731664725,292 205,292 w=1",
        ],
        "polys": [
          "-20.302921731664725,5 205,5 205,292 30.302921731664725,292",
        ],
      }
    `);
  });

  // Full corner coverage: a skew_bottom row over a lower row, next to a skewed
  // vertical gutter — a minimized `horizontal_columns`. The lower panel gets a
  // shared TOP skewline that intersects the vertical skewline, and the upper
  // `car` panel gets a shared BOTTOM skewline that does too. These two cases put
  // the vertical gutter on each side so all four intersection sites
  // (top×right, top×left, bottom×right, bottom×left) are exercised.
  it("corner sites top×right + bottom×right (skewed vertical gutter on the right)", () => {
    expect(
      shapes(`page { gutter:4 padding:8 border:0.5
        row {
          col {
            row height: 60% { skew_bottom: 10 panel car {} }
            row { col { panel lowL {} } col { panel lowR {} } }
          }
          col width: 25% { panel action { skew_left: 8 } }
        } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "8,8 8,161.63670262452186 w=0.5",
          "130.754012724314,8 156.01420401918978,187.73560032119232 w=0.5",
          "8,8 130.754012724314,8 w=0.5",
          "8,161.63670262452186 156.01420401918978,187.73560032119232 w=0.5",
          "8,165.63670262452186 8,289 w=0.5",
          "77.25,177.84734603858305 77.25,289 w=0.5",
          "8,165.63670262452186 77.25,177.84734603858305 w=0.5",
          "8,289 77.25,289 w=0.5",
          "81.25,178.55265396141692 81.25,289 w=0.5",
          "156.5906524068004,191.83724372491398 170.245987275686,289 w=0.5",
          "81.25,178.55265396141692 156.5906524068004,191.83724372491398 w=0.5",
          "81.25,289 170.245987275686,289 w=0.5",
          "134.754012724314,8 174.245987275686,289 w=0.5",
          "202,8 202,289 w=0.5",
          "134.754012724314,8 202,8 w=0.5",
          "174.245987275686,289 202,289 w=0.5",
        ],
        "polys": [
          "8,8 130.754012724314,8 154.11189945185146,187.40017270044564 8,161.63670262452186",
          "8,165.63670262452186 77.25,177.84734603858305 77.25,289 8,289",
          "81.25,178.55265396141692 154.67406279066103,191.49929726464293 170.245987275686,289 81.25,289",
          "134.754012724314,8 202,8 202,289 174.245987275686,289",
        ],
      }
    `);
  });

  it("corner sites top×left + bottom×left (skewed vertical gutter on the left)", () => {
    expect(
      shapes(`page { gutter:4 padding:8 border:0.5
        row {
          col width: 25% { panel action { skew_right: -8 } }
          col {
            row height: 60% { skew_bottom: 10 panel car {} }
            row { col { panel lowL {} } col { panel lowR {} } }
          }
        } }`),
    ).toMatchInlineSnapshot(`
      {
        "lines": [
          "8,8 8,289 w=0.5",
          "75.24598727568599,8 35.754012724314,289 w=0.5",
          "8,8 75.24598727568599,8 w=0.5",
          "8,289 35.754012724314,289 w=0.5",
          "79.24598727568599,8 57.6984024899239,161.31903237511824 w=0.5",
          "202,8 202,186.76329737547812 w=0.5",
          "79.24598727568599,8 202,8 w=0.5",
          "57.6984024899239,161.31903237511824 202,186.76329737547812 w=0.5",
          "57.149833321063184,165.22230482986328 39.754012724314,289 w=0.5",
          "128.75,177.84734603858305 128.75,289 w=0.5",
          "57.14983332106318,165.22230482986328 128.75,177.84734603858305 w=0.5",
          "39.754012724314,289 128.75,289 w=0.5",
          "132.75,178.55265396141692 132.75,289 w=0.5",
          "202,190.76329737547812 202,289 w=0.5",
          "132.75,178.55265396141692 202,190.76329737547812 w=0.5",
          "132.75,289 202,289 w=0.5",
        ],
        "polys": [
          "8,8 75.24598727568599,8 35.754012724314,289 8,289",
          "79.24598727568599,8 202,8 202,186.76329737547812 55.88810054814854,160.99982729955434",
          "55.325937209338974,164.90070273535704 128.75,177.84734603858305 128.75,289 39.754012724314,289",
          "132.75,178.55265396141692 202,190.76329737547812 202,289 132.75,289",
        ],
      }
    `);
  });

  // Regression: a panel with BOTH skew_left and offset_left. The offset wipes
  // the shared `left.skewline` (the edge moved off the gutter), but the panel
  // still slants via attrs.skewLeft. The top-border test used to look only at
  // `left/right.skewline`, so the top edge was dropped and the frame stayed
  // open at the top — adjacent panels looked like they had "disappeared".
  // (examples/skew_sample1.manga, panel_2.) The top border must be present.
  it("skew_left + offset_left still draws the top border", () => {
    const { lines } = shapes(`page { padding:5 border:1 gutter:6 direction: rtl
      col {
        row height: 40% { panel top {} }
        row { col { panel R { skew_left: 8 offset_left: 3 } } col { panel L {} } }
      } }`);
    // The skewed right panel R sits below the shared gutter at y=123.4; its top
    // edge runs horizontally from the top of its slanted left side to its right
    // side. Before the fix this line was missing entirely.
    const topR = lines.find((l) => l.startsWith("93.1524076345884,123.4 205,123.4"));
    expect(topR, `R panel top border missing; lines=\n${lines.join("\n")}`).toBeTruthy();
  });
});
