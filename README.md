# manga-composer

A DSL (domain-specific language) and compiler for declaratively describing
manga panel layouts. Write a `.manga` file and compile it to **SVG** or **PNG**.

manga-composer is a TypeScript port of the Python `manga-gen` library. It ships
as a CLI and as a programmatic library.

Repository: <https://github.com/masayukitanaka/manga-composer>

> 日本語版は [README_ja.md](README_ja.md) を参照してください。

## Features

- **Declarative layout** — divide the page with `row` / `col` / `panel`, nested
  arbitrarily deep.
- **Flexible sizing** — mix `%`, `mm`, and `auto`.
- **Reading direction** — left-to-right (`ltr`) or right-to-left (`rtl`, for
  Japanese manga).
- **Images** — embed PNG / JPEG / GIF / SVG inside panels with `cover` /
  `contain` / `fill`.
- **Dynamic effects** — slant panel borders (`skew_*`) and overlap panels
  (`offset_*`, `z_index`) for action scenes.
- **Selective borders** — control each side independently.
- **Speech balloons & monologue** — `balloon` / `monologue` nested inside a
  panel, with several shapes (oval, shout, whisper, jagged, explosion, thought,
  rounded_box).
- **Standard page sizes** — A3, A4, B4, B5, plus custom `WxH` sizes.
- **SVG and PNG output** — SVG via a built-in renderer, PNG via
  [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js).

## Installation

> **Note:** manga-composer is not published to the npm registry yet. Install it
> directly from GitHub. (The package builds itself on install via a `prepare`
> script, so no manual build step is needed.)

Install the CLI globally:

```bash
npm install -g github:masayukitanaka/manga-composer
```

Run it once without a global install:

```bash
npx github:masayukitanaka/manga-composer input.manga -o output.svg
```

Add it as a dependency of a project (for use as a library):

```bash
npm install github:masayukitanaka/manga-composer
```

You can also pin a specific branch, tag, or commit:

```bash
npm install github:masayukitanaka/manga-composer#main
```

Or clone and link it for local development:

```bash
git clone https://github.com/masayukitanaka/manga-composer.git
cd manga-composer
npm install
npm run build
npm link            # makes the `manga-composer` command available globally
```

## Quick start

### 1. Write a `.manga` file

```manga
// simple.manga
page {
  size: B5
  direction: rtl
  gutter: 6

  row height: 60% {
    panel hero {
      image: "images/hero.png"
      image_fit: cover
    }
  }

  row {
    col { panel detail1 }
    col { panel detail2 }
  }
}
```

### 2. Compile it

```bash
# PNG output (default)
manga-composer simple.manga

# SVG output
manga-composer simple.manga -o output.svg

# High-resolution PNG
manga-composer simple.manga -o print.png --dpi 600
```

## CLI usage

```
manga-composer <input> [options]

Arguments:
  input                 Path to the .manga source file

Options:
  -o, --output <file>   Output file (.png or .svg)
  --format <fmt>        Output format: png | svg | auto
                        (default: auto-detect from the output extension)
  --dpi <n>             DPI for PNG output
                        (default: the DSL's dpi setting, or 300)
  -h, --help            Show help
```

- If `-o` is omitted, the output path is the input filename with a `.png`
  extension.
- With `--format auto` (the default), the format is chosen from the output
  file's extension.
- Image paths inside a `.manga` file are resolved relative to that file.

## Programmatic API

```ts
import { compileToSvg, parse, LayoutEngine, SVGRenderer } from "manga-composer";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

const path = "simple.manga";
const source = readFileSync(path, "utf-8");

// One-shot: source → SVG string
const svg = compileToSvg(source, dirname(path));

// Or drive the pipeline stage by stage:
const page = parse(source);
const engine = new LayoutEngine(page);
const panels = engine.layout();
const renderer = new SVGRenderer(page, panels, engine.speeches, dirname(path));
const svg2 = renderer.render();
```

To rasterize the SVG to PNG:

```ts
import { svgToPng } from "manga-composer";

const png = svgToPng(svg, { dpi: 300, widthMm: page.config.widthMm });
```

## DSL reference

### Page

```manga
page optional_name {
  size: A4            // A3 | A4 | B4 | B5 | <W>x<H> | <W>x<H>px
  direction: ltr      // ltr | rtl
  gutter: 5           // gap between panels (mm)
  padding: 10         // page margin (mm); padding_top/bottom/left/right override
  background: "#ffffff"
  gutter_color: "#ffffff"  // fills gutters and margins (e.g. black for flashbacks)
  dpi: 300
  border: 1           // default panel border width (mm)
  border_color: "#000000"
}
```

Standard sizes (mm): A3 = 297×420, A4 = 210×297, B4 = 257×364, B5 = 182×257.
Custom sizes use `<W>x<H>` (mm) or `<W>x<H>px`.

### Layout: row / col

`row` reserves vertical space and lays out its children horizontally; `col`
reserves horizontal space and lays out its children vertically.

```manga
row height: 40% { ... }   // percentage of the parent
row height: 60mm { ... }  // absolute
row { ... }               // auto: shares the remaining space

col width: 30% { ... }
```

Attributes: `height` (row) / `width` (col), `gutter`, `align`
(`start`/`center`/`end`), `margin_top`/`margin_bottom`/`margin_left`/`margin_right`,
and `skew_left`/`skew_right`/`skew_top`/`skew_bottom` (inherited by child
panels).

### panel

```manga
panel my_panel                          // minimal
panel hero importance: 1, border: 2     // single-line attributes
panel quiet {                           // block form
  image: "assets/hero.png"
  image_fit: cover
  background: "#f0f0f0"
}
```

Key attributes:

| Attribute | Values | Description |
|---|---|---|
| `importance` | `1` \| `2` \| `3` | Importance (1 = most important); default stacking order |
| `z_index` | int | Stacking order (higher = front); overrides `importance` |
| `image` | path | Image to place in the panel |
| `image_fit` | `cover` \| `contain` \| `fill` | How to fit the image |
| `text` / `text_direction` | string / `horizontal`\|`vertical` | In-panel text |
| `label` | string | Centered label (handy while designing) |
| `border` / `border_color` | number / color | Border width and color |
| `border_top`/`bottom`/`left`/`right` | number | Per-side width (`0` hides) |
| `background` | color | Panel background |
| `skew_left`/`right`/`top`/`bottom` | degrees | Slant a border |
| `offset_top`/`bottom`/`left`/`right` | mm | Negative expands (bleeds out), positive shrinks |

### Speech balloons & monologue

`balloon` and `monologue` are nested inside a `panel { ... }` block.

```manga
panel char_a {
  balloon {
    anchor_pos: top_right
    text: "Wait up!"
    shape: shout
    tail_angle: 225   // degrees, clockwise from 12 o'clock
  }
  monologue {
    text: "And so, the incident began."
    background: "#000000"
    text_color: "#ffffff"
    x: 15
    y: 15
  }
}
```

`balloon` shapes: `oval`, `shout`, `whisper`, `jagged`, `explosion`, `thought`,
`rounded_box`. `monologue` is always a plain rectangle (use `background` /
`text_color` for an inner-voice or narration-caption look).

### Comments

```manga
// single-line comment
/* multi-line
   comment */
```

See the [`manga-gen-python/docs/`](manga-gen-python/docs/) directory (`DSL.md`,
`SPEC.md`) for the full reference the port follows.

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/
npm run cli -- file.manga -o out.svg   # run the CLI without building (via tsx)
npm test             # run the unit tests (vitest)
npm run compare      # verify output against the Python reference (see below)
```

### Verification against the Python reference

The port is verified by comparing its SVG output against reference SVGs
generated by the original Python `manga-gen`:

```bash
npm run compare              # compare examples2/ (the acceptance corpus)
npm run compare -- --all     # also compare examples/
npm run compare -- --png     # additionally run a PNG pixel diff (informational)
npm run generate-references  # regenerate reference SVGs (needs the Python CLI)
```

Comparison is primarily structural (element tree + numeric attributes within a
small tolerance). Balloon outlines are compared at bounding-box level, since
their hand-drawn jitter uses a different (but internally deterministic) PRNG
than the Python original — see
[`docs/PORTING_NOTES.md`](docs/PORTING_NOTES.md).

## License

MIT — see [LICENSE](LICENSE).
