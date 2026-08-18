import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { serialize } from "../../src/serialize.js";
import { ParseError } from "../../src/errors.js";
import {
  LayoutEngine,
  resolveImageLayerRect,
  Rect,
  type LayoutedPanel,
} from "../../src/layout/slicing.js";
import { SVGRenderer } from "../../src/renderer/svg.js";
import type { ImageLayer, PanelNode } from "../../src/ast.js";
import type { ImageLoader } from "../../src/renderer/imageLoader.js";

function panel0(src: string): PanelNode {
  const page = parse(src);
  const p = page.children[0];
  if (p.kind !== "panel") throw new Error("expected a panel");
  return p;
}

// A loader that "finds" every path with a 1x1 transparent PNG.
const stubLoader: ImageLoader = () => ({
  dataBase64: "AAAA",
  mime: "image/png",
});

function renderPanels(src: string): { panels: LayoutedPanel[]; svg: string } {
  const page = parse(src);
  const engine = new LayoutEngine(page);
  const panels = engine.layout();
  const svg = new SVGRenderer(page, panels, engine.speeches, stubLoader).render();
  return { panels, svg };
}

describe("image layers — parsing / normalization", () => {
  it("normalizes single `image:` sugar into one full-bleed layer (imageFit inherit)", () => {
    const p = panel0(`page { panel hero { image: "x.png" } }`);
    expect(p.attrs.imageLayers).toEqual<ImageLayer[]>([
      {
        path: "x.png",
        imageFit: null,
        anchorPos: "center",
        x: null,
        y: null,
        width: null,
        height: null,
        dx: { value: 0, unit: "mm" },
        dy: { value: 0, unit: "mm" },
        clip: null,
        flipH: false,
      },
    ]);
  });

  it("`image: + image_fit:` still normalizes to inherit (fit lives on the panel)", () => {
    const p = panel0(`page { panel hero { image: "x.png" image_fit: contain } }`);
    expect(p.attrs.imageFit).toBe("contain");
    expect(p.attrs.imageLayers).toHaveLength(1);
    expect(p.attrs.imageLayers[0].imageFit).toBeNull();
  });

  it("parses an images block, preserving document order (first = back)", () => {
    const p = panel0(`page {
      panel scene {
        images {
          { "bg.png" image_fit: cover }
          { path: "char.png" image_fit: contain }
        }
      }
    }`);
    const layers = p.attrs.imageLayers;
    expect(layers.map((l) => l.path)).toEqual(["bg.png", "char.png"]);
    expect(layers[0].imageFit).toBe("cover");
    expect(layers[1].imageFit).toBe("contain");
  });

  it("accepts bare-string path, `path:`, and mixed forms", () => {
    const p = panel0(`page {
      panel scene {
        images {
          { "a.png" }
          { path: "b.png" }
          { "c.png" image_fit: fill }
        }
      }
    }`);
    expect(p.attrs.imageLayers.map((l) => l.path)).toEqual(["a.png", "b.png", "c.png"]);
    expect(p.attrs.imageLayers[2].imageFit).toBe("fill");
  });

  it("parses position/size attributes as %/mm lengths", () => {
    const p = panel0(`page {
      panel scene {
        images {
          { "char.png" width: 60% height: 90mm anchor_pos: bottom_right x: 10% y: 5mm dx: 2mm dy: 1% }
        }
      }
    }`);
    const l = p.attrs.imageLayers[0];
    expect(l.width).toEqual({ value: 60, unit: "%" });
    expect(l.height).toEqual({ value: 90, unit: "mm" });
    expect(l.anchorPos).toBe("bottom_right");
    expect(l.x).toEqual({ value: 10, unit: "%" });
    expect(l.y).toEqual({ value: 5, unit: "mm" });
    expect(l.dx).toEqual({ value: 2, unit: "mm" });
    expect(l.dy).toEqual({ value: 1, unit: "%" });
  });

  it("treats a bare number length as mm", () => {
    const p = panel0(`page { panel s { images { { "a.png" width: 40 } } } }`);
    expect(p.attrs.imageLayers[0].width).toEqual({ value: 40, unit: "mm" });
  });
});

describe("image layers — validation errors", () => {
  it("rejects `image` and `images` together", () => {
    expect(() =>
      parse(`page { panel s { image: "a.png" images { { "b.png" } } } }`),
    ).toThrow(ParseError);
  });

  it("rejects an unknown layer attribute", () => {
    expect(() => parse(`page { panel s { images { { "a.png" foo: 1 } } } }`)).toThrow(
      /Unknown image layer attribute: foo/,
    );
  });

  it("rejects a layer with no path", () => {
    expect(() => parse(`page { panel s { images { { image_fit: cover } } } }`)).toThrow(
      /requires a `path`/,
    );
  });

  it("rejects both a bare path and `path:` in one layer", () => {
    expect(() =>
      parse(`page { panel s { images { { "a.png" path: "b.png" } } } }`),
    ).toThrow(ParseError);
  });

  it("rejects px/pt units for placement", () => {
    expect(() => parse(`page { panel s { images { { "a.png" width: 40px } } } }`)).toThrow(
      /must use mm\/%/,
    );
  });

  it("rejects non-positive width/height", () => {
    expect(() => parse(`page { panel s { images { { "a.png" width: 0% } } } }`)).toThrow(
      /must be positive/,
    );
    expect(() => parse(`page { panel s { images { { "a.png" height: -5mm } } } }`)).toThrow(
      /must be positive/,
    );
  });

  it("rejects a second images block in one panel", () => {
    expect(() =>
      parse(`page { panel s { images { { "a.png" } } images { { "b.png" } } } }`),
    ).toThrow(ParseError);
  });
});

describe("image layers — placement resolution", () => {
  const panel = new Rect(100, 200, 80, 60);

  function layer(over: Partial<ImageLayer>): ImageLayer {
    return {
      path: "x.png",
      imageFit: null,
      anchorPos: "center",
      x: null,
      y: null,
      width: null,
      height: null,
      dx: { value: 0, unit: "mm" },
      dy: { value: 0, unit: "mm" },
      clip: null,
        flipH: false,
      ...over,
    };
  }

  it("no placement attrs → fills the panel rect", () => {
    const r = resolveImageLayerRect(layer({}), panel);
    expect(r).toEqual(new Rect(100, 200, 80, 60));
  });

  it("% width/height resolve against panel w/h", () => {
    const r = resolveImageLayerRect(
      layer({ width: { value: 50, unit: "%" }, height: { value: 50, unit: "%" } }),
      panel,
    );
    expect(r.w).toBe(40);
    expect(r.h).toBe(30);
  });

  it("anchor_pos bottom_right pins the box's bottom-right to the panel corner", () => {
    const r = resolveImageLayerRect(
      layer({
        width: { value: 50, unit: "%" },
        height: { value: 50, unit: "%" },
        anchorPos: "bottom_right",
      }),
      panel,
    );
    // panel right = 180, bottom = 260; box 40x30 → x=140, y=230
    expect(r).toEqual(new Rect(140, 230, 40, 30));
  });

  it("x/y are panel-relative and override anchor per-axis", () => {
    const r = resolveImageLayerRect(
      layer({
        width: { value: 20, unit: "mm" },
        height: { value: 20, unit: "mm" },
        anchorPos: "bottom_right",
        x: { value: 0, unit: "mm" }, // pin left edge to panel.x, keep anchored Y
      }),
      panel,
    );
    expect(r.x).toBe(100); // panel.x + 0
    // Y still from bottom_right anchor: panel bottom 260 - 20 = 240
    expect(r.y).toBe(240);
  });

  it("dx/dy offset after placement (% of panel axis)", () => {
    const r = resolveImageLayerRect(
      layer({
        width: { value: 80, unit: "mm" },
        height: { value: 60, unit: "mm" },
        anchorPos: "top_left",
        dx: { value: 10, unit: "%" }, // 10% of 80 = 8
        dy: { value: 5, unit: "mm" },
      }),
      panel,
    );
    expect(r.x).toBe(108); // 100 + 8
    expect(r.y).toBe(205); // 200 + 5
  });
});

describe("image layers — rendering", () => {
  it("emits one <image> per layer", () => {
    const { svg } = renderPanels(`page {
      panel scene {
        images {
          { "bg.png" }
          { "char.png" }
        }
      }
    }`);
    const imgs = [...svg.matchAll(/<image\b[^>]*\/>/g)];
    expect(imgs).toHaveLength(2);
  });

  it("draws a missing layer as a placeholder without dropping other layers", () => {
    // Loader resolves "ok.png" but not "missing.png".
    const page = parse(`page {
      panel scene {
        images {
          { "ok.png" }
          { "missing.png" }
        }
      }
    }`);
    const engine = new LayoutEngine(page);
    const panels = engine.layout();
    const loader: ImageLoader = (p) =>
      p === "ok.png" ? { dataBase64: "AAAA", mime: "image/png" } : null;
    const svg = new SVGRenderer(page, panels, engine.speeches, loader).render();
    expect([...svg.matchAll(/<image\b[^>]*\/>/g)]).toHaveLength(1); // ok.png
    expect(svg).toContain("Image not found: missing.png");
  });

  it("applies a layer's placement rect to its <image>", () => {
    // A4 page (210x297), default padding 10 → panel rect = (10,10,190,277).
    const { svg } = renderPanels(`page {
      panel scene {
        images {
          { "char.png" width: 50% height: 50% anchor_pos: top_left }
        }
      }
    }`);
    const img = svg.match(/<image\b[^>]*\/>/)![0];
    // width = 50% of 190 = 95, height = 50% of 277 = 138.5, x=10, y=10
    expect(img).toMatch(/width="95"/);
    expect(img).toMatch(/height="138.5"/);
    expect(img).toMatch(/x="10"/);
    expect(img).toMatch(/y="10"/);
  });

  it("still renders a legacy single image full-bleed", () => {
    const { svg } = renderPanels(`page { panel s { image: "x.png" } }`);
    const imgs = [...svg.matchAll(/<image\b[^>]*\/>/g)];
    expect(imgs).toHaveLength(1);
    expect(imgs[0][0]).toMatch(/width="190"/);
    expect(imgs[0][0]).toMatch(/height="277"/);
  });
});

describe("image layers — clip", () => {
  it("defaults to clip (layer.clip null, panel imageClip true)", () => {
    const p = panel0(`page { panel s { images { { "a.png" } } } }`);
    expect(p.attrs.imageClip).toBe(true);
    expect(p.attrs.imageLayers[0].clip).toBeNull();
  });

  it("parses per-layer clip and panel image_clip", () => {
    const p = panel0(`page {
      panel s {
        image_clip: false
        images {
          { "a.png" clip: true }
          { "b.png" }
        }
      }
    }`);
    expect(p.attrs.imageClip).toBe(false);
    expect(p.attrs.imageLayers[0].clip).toBe(true);
    expect(p.attrs.imageLayers[1].clip).toBeNull();
  });

  it("rejects a non-boolean clip / image_clip", () => {
    expect(() => parse(`page { panel s { images { { "a.png" clip: 1 } } } }`)).toThrow(
      /clip must be true or false/,
    );
    expect(() => parse(`page { panel s { image_clip: yes images { { "a.png" } } } }`)).toThrow(
      /image_clip must be true or false/,
    );
  });

  it("clips each layer to the panel by default (clip-path on <image>)", () => {
    const { svg } = renderPanels(`page {
      panel s { images { { "a.png" x: 70% width: 50% } } }
    }`);
    const img = svg.match(/<image\b[^>]*\/>/)![0];
    expect(img).toMatch(/clip-path="url\(#clip_imgs_s\)"/);
    expect(svg).toContain('<clipPath id="clip_imgs_s">');
  });

  it("clip: false leaves the layer un-clipped (bleeds out)", () => {
    const { svg } = renderPanels(`page {
      panel s { images { { "a.png" x: 70% width: 50% clip: false } } }
    }`);
    const img = svg.match(/<image\b[^>]*\/>/)![0];
    expect(img).not.toMatch(/clip-path/);
  });

  it("image_clip: false flips the panel default for all layers", () => {
    const { svg } = renderPanels(`page {
      panel s {
        image_clip: false
        images {
          { "a.png" x: 70% }
          { "b.png" x: 10% clip: true }
        }
      }
    }`);
    const imgs = [...svg.matchAll(/<image\b[^>]*\/>/g)].map((m) => m[0]);
    expect(imgs[0]).not.toMatch(/clip-path/); // inherits panel default (false)
    expect(imgs[1]).toMatch(/clip-path/); // explicit clip: true
  });

  it("reuses one clipPath per panel across clipped layers", () => {
    const { svg } = renderPanels(`page {
      panel s { images { { "a.png" x: 10% } { "b.png" x: 60% } } }
    }`);
    const defs = [...svg.matchAll(/<clipPath id="clip_imgs_s">/g)];
    expect(defs).toHaveLength(1);
  });

  // A flat panel's image clip stays an axis-aligned <rect>.
  it("uses a rect image clip on a non-skewed panel", () => {
    const { svg } = renderPanels(`page {
      panel s { images { { "a.png" width: 50% } } }
    }`);
    const cp = svg.match(/<clipPath id="clip_imgs_s">(.*?)<\/clipPath>/)![1];
    expect(cp).toMatch(/<rect\b/);
    expect(cp).not.toMatch(/<polygon\b/);
  });

  // Regression: a skewed panel must clip its images to the FRAME polygon, so the
  // image trims along the slanted edge — not a flat rect that cut it on a
  // horizontal line across a slanted top/bottom. (examples/skew_image.manga.)
  // The image clip polygon must equal the panel's fill polygon exactly.
  it("clips images to the skewed frame polygon (not a flat rect)", () => {
    const { svg } = renderPanels(`page { border:1
      col {
        row { panel s { skew_bottom: 8 images { { "a.png" width: 100% height: 120% } } } }
        row { panel b {} }
      } }`);
    const clip = svg.match(/<clipPath id="clip_imgs_s"><polygon points="([^"]*)"/);
    expect(clip, "image clip should be a polygon on a skewed panel").toBeTruthy();
    // The clip polygon matches the panel's own fill polygon (same 4 corners).
    const fill = [...svg.matchAll(/<polygon points="([^"]*)" fill="[^"]*" stroke="none"/g)].map(
      (m) => m[1],
    );
    expect(fill).toContain(clip![1]);
    // And the slanted bottom edge means the two bottom corners have different Ys.
    const pts = clip![1].split(" ").map((p) => p.split(",").map(Number));
    const ys = pts.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
  });
});

describe("image layers — flip_h (horizontal mirror)", () => {
  it("defaults to no flip and parses flip_h: true", () => {
    const a = panel0(`page { panel s { images { { "a.png" } } } }`).attrs.imageLayers[0];
    expect(a.flipH).toBe(false);
    const b = panel0(`page { panel s { images { { "a.png" flip_h: true } } } }`).attrs
      .imageLayers[0];
    expect(b.flipH).toBe(true);
  });

  it("rejects a non-boolean flip_h", () => {
    expect(() => parse(`page { panel s { images { { "a.png" flip_h: 1 } } } }`)).toThrow(
      /flip_h must be true or false/,
    );
  });

  it("mirrors the <image> about its box center when flip_h is true", () => {
    // A4 page (210x297), default padding 10 → panel rect (10,10,190,277),
    // box center X = 10 + 190/2 = 105, so translate(210 0) scale(-1 1).
    const { svg } = renderPanels(`page { panel s { images { { "x.png" flip_h: true } } } }`);
    const img = svg.match(/<image\b[^>]*>/)![0];
    expect(img).toMatch(/transform="translate\(210 0\) scale\(-1 1\)"/);
  });

  it("does not add a transform when flip_h is false", () => {
    const { svg } = renderPanels(`page { panel s { images { { "x.png" } } } }`);
    const img = svg.match(/<image\b[^>]*>/)![0];
    expect(img).not.toMatch(/transform=/);
  });
});

describe("image layers — serialize round-trip", () => {
  function roundTrip(src: string) {
    const first = parse(src);
    const second = parse(serialize(first));
    expect(second).toEqual(first);
  }

  it("round-trips an images block with placement", () => {
    roundTrip(`page {
      panel scene {
        images {
          { path: "bg.png" }
          { path: "char.png" image_fit: contain anchor_pos: bottom_right width: 60% height: 90% }
        }
      }
    }`);
  });

  it("round-trips single-image sugar", () => {
    roundTrip(`page { panel s { image: "x.png" image_fit: contain } }`);
  });

  it("round-trips clip / image_clip", () => {
    roundTrip(`page {
      panel s {
        image_clip: false
        images {
          { path: "a.png" }
          { path: "b.png" clip: true x: 70% width: 40% }
        }
      }
    }`);
  });

  it("round-trips flip_h", () => {
    roundTrip(`page { panel s { images { { path: "a.png" flip_h: true } } } }`);
  });
});
