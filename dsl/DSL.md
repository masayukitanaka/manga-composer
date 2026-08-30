# MangaDSL Language Reference

A reference guide for a domain-specific language (DSL) for declaratively describing manga panel layouts.

---

## 1. Basic Information

### File Extension

`.manga`

### Character Encoding

UTF-8

---

## 2. Page Declaration

### Basic Syntax

```manga
page {
  // Page attributes
  size: A4
  direction: rtl
  gutter: 8
  padding: 20
  background: "#ffffff"
  dpi: 300

  // Layout statements
  // ...
}
```

### Named Pages (Optional)

```manga
page main_layout {
  // ...
}
```

### Page Attributes

| Attribute | Type | Default | Description |
|------|-----|-----------|------|
| `size` | `A3` \| `A4` \| `B4` \| `B5` \| `<W>x<H>` | `A4` | Page size |
| `direction` | `rtl` \| `ltr` | `ltr` | Reading order (right→left or left→right) |
| `gutter` | number (mm) | `5` | Gap between panels |
| `padding` | number (mm) | `10` | Page outer margin (all four sides) |
| `padding_top` | number (mm) | `padding` value | Top margin override (falls back to `padding`) |
| `padding_bottom` | number (mm) | `padding` value | Bottom margin override |
| `padding_left` | number (mm) | `padding` value | Left margin override |
| `padding_right` | number (mm) | `padding` value | Right margin override |
| `background` | color | `"#ffffff"` | Page background color |
| `dpi` | number | `300` | Resolution for PNG output |
| `border` | number (mm) | `1` | Default border thickness for all panels |
| `border_color` | color | `"#000000"` | Default border color for all panels |
| `gutter_color` | color | `"#ffffff"` | Color of gutters and page margins (areas outside panels) |

#### Size Specifications

| Size | Width × Height (mm) |
|--------|-------------|
| A3 | 297 × 420 |
| A4 | 210 × 297 |
| B4 | 257 × 364 |
| B5 | 182 × 257 |

#### Custom Size Specification

```manga
page {
  size: 150x200  // Width 150mm × Height 200mm
}
```

---

## 3. Layout Elements

### 3.1 row

A container that reserves vertical space and arranges child elements horizontally within it.

#### Basic Syntax

```manga
row {
  // Child elements (col, panel, row)
}
```

#### Height Specification

```manga
// Percentage specification (40% of parent element)
row height: 40% {
  // ...
}

// Absolute specification (60mm)
row height: 60mm {
  // ...
}

// Omitted (remaining space divided equally)
row {
  // ...
}

```

#### Attributes

| Attribute | Type | Default | Description |
|------|-----|-----------|------|
| `height` | `<n>%` \| `<n>mm` \| omitted | auto | Height |
| `gutter` | number (mm) | inherited | Gutter within this level |
| `align` | `start` \| `center` \| `end` | `start` | Alignment when there is extra space |
| `skew_left` | number (degrees) | `0` | Left boundary skew angle (inherited by child panels) |
| `skew_right` | number (degrees) | `0` | Right boundary skew angle (inherited by child panels) |
| `skew_top` | number (degrees) | `0` | Top boundary skew angle (inherited by child panels) |
| `skew_bottom` | number (degrees) | `0` | Bottom boundary skew angle (inherited by child panels) |

### 3.2 col

A container that reserves horizontal space and arranges child elements vertically within it.

#### Basic Syntax

```manga
col {
  // Child elements (row, panel, col)
}
```

#### Width Specification

```manga
// Percentage specification (30% of parent element)
col width: 30% {
  // ...
}

// Absolute specification (50mm)
col width: 50mm {
  // ...
}

// Omitted (remaining space divided equally)
col {
  // ...
}

```

#### Attributes

| Attribute | Type | Default | Description |
|------|-----|-----------|------|
| `width` | `<n>%` \| `<n>mm` \| omitted | auto | Width |
| `gutter` | number (mm) | inherited | Gutter within this level |
| `align` | `start` \| `center` \| `end` | `start` | Alignment when there is extra space |
| `skew_left` | number (degrees) | `0` | Left boundary skew angle (inherited by child panels) |
| `skew_right` | number (degrees) | `0` | Right boundary skew angle (inherited by child panels) |
| `skew_top` | number (degrees) | `0` | Top boundary skew angle (inherited by child panels) |
| `skew_bottom` | number (degrees) | `0` | Bottom boundary skew angle (inherited by child panels) |

#### Applying skew to col (Skewing an Entire Column's Boundary)

Setting `skew_right` on a `col` tilts that column's right boundary and propagates the angle to all panels inside. This lets you apply a diagonal gutter to an entire column without setting skew on each panel individually.

```manga
page {
  gutter: 6
  border: 1

  row {
    col {
      skew_right: -6        // Tilt the right boundary of this column -6 degrees
      panel left1 {}        // left1's right border gets the -6 degree tilt
    }
    col {
      row { panel right1 {} }   // right1's left border also gets the tilt
      row { panel right2 {} }   // right2 likewise
    }
  }
}
```

**Key points:**
- `skew_right` on a `col` affects **both** that column's right boundary and the adjacent column's left boundary.
- All panels inside the column inherit the skew, even when the column contains multiple `row` elements.
- The gutter between the two columns is automatically rendered as the white space between the two parallel diagonal border lines.

### 3.3 panel

A leaf element representing a manga panel (frame).

#### Basic Syntax

```manga
// Minimal form
panel my_panel

// Single-line attribute form
panel hero importance: 1, border: 2

// Block form
panel quiet {
  importance: 2
  image: "assets/hero.png"
  border: 1
  background: "#f0f0f0"
}
```

#### Panel Attributes

| Attribute | Type | Default | Description |
|------|-----|-----------|------|
| `importance` | `1` \| `2` \| `3` | `2` | Importance (1 is most important). Also used as the default stacking order |
| `z_index` | int (may be negative) | none | Stacking order (higher = front). When omitted, derived from importance (1→+1, 2→0, 3→-1) |
| `image` | string (path) | none | Path to a single image within the panel. For multiple layered images, use an `images { ... }` block instead (see below) |
| `image_fit` | `cover` \| `contain` \| `fill` | `cover` | How to fit the image |
| `image_clip` | `true` \| `false` | `true` | Default clip behavior for this panel's image layers (a layer's own `clip` overrides it). `true` = clip layers to the panel rect |
| `description` | string | none | A note describing what the panel should contain (storyboard/script aid) |
| `show_description` | `true` \| `false` | `false` | When `true` AND the panel has no images, draw `description` as centered placeholder text |
| `text` | string | none | Text within panel |
| `text_direction` | `horizontal` \| `vertical` | `horizontal` | Text direction |
| `border` | number (mm) | `1` | Border thickness (all sides) |
| `border_color` | color | `"#000000"` | Border color |
| `border_top` | number (mm) | `None` | Top border thickness (0=hidden) |
| `border_bottom` | number (mm) | `None` | Bottom border thickness (0=hidden) |
| `border_left` | number (mm) | `None` | Left border thickness (0=hidden) |
| `border_right` | number (mm) | `None` | Right border thickness (0=hidden) |
| `background` | color | `"#ffffff"` | Panel background color |
| `skew_left` | number (degrees) | `0` | Left border skew angle |
| `skew_right` | number (degrees) | `0` | Right border skew angle |
| `skew_top` | number (degrees) | `0` | Top border skew angle |
| `skew_bottom` | number (degrees) | `0` | Bottom border skew angle |
| `offset_top` | number (mm) | `0` | Top position offset (negative=expand) |
| `offset_bottom` | number (mm) | `0` | Bottom position offset (negative=expand) |
| `offset_left` | number (mm) | `0` | Left position offset (negative=expand) |
| `offset_right` | number (mm) | `0` | Right position offset (negative=expand) |

#### Image Specification

To place an image within a panel, specify a relative path using the `image` attribute.

```manga
panel hero {
  image: "assets/hero.png"
  image_fit: cover
}
```

**Path Specification Rules:**
- Relative path from the `.manga` file
- Supported formats: PNG, JPEG, GIF, SVG
- Examples: `"./images/scene1.png"`, `"../assets/hero.jpg"`

**image_fit Options:**
- `cover`: Maintain aspect ratio while covering the entire panel (excess parts are cropped)
- `contain`: Maintain aspect ratio while fitting within the panel (may leave whitespace)
- `fill`: Ignore aspect ratio and stretch to fill the entire panel

```manga
// Cover (default) - image fills the panel
panel p1 {
  image: "bg.jpg"
  image_fit: cover
}

// Contain - entire image is visible
panel p2 {
  image: "character.png"
  image_fit: contain
}

// Fill - stretch to completely fill
panel p3 {
  image: "texture.png"
  image_fit: fill
}
```

#### Multiple Images (Image Layers)

A panel can stack several images with an `images { ... }` block — useful for
compositing a background and one or more characters that you generate and edit
separately. Each layer is a `{ ... }` block. **Layers stack in document order:
the first is drawn at the back (background), later ones in front.**

```manga
panel scene {
  images {
    { "bg/room.png"   image_fit: cover }                    // back: background
    { "char/hero.png" image_fit: contain                    // front: character
      width: 60% height: 90% anchor_pos: bottom_right }
  }
}
```

The single `image:` attribute is exactly equivalent to a one-layer block
(`images { { "x.png" } }`), so existing files keep working. You cannot set both
`image:` and `images { }` on the same panel.

**Layer path forms** — the path may be a bare leading string or an explicit
`path:` key:

```manga
images {
  { "a.png" }                     // bare string = path
  { path: "b.png" }               // explicit path key
  { "c.png" image_fit: fill }     // bare string + attributes
}
```

**Layer attributes:**

| Attribute | Type | Default | Description |
|---|---|---|---|
| `path` | string (required) | — | Image path (relative to the `.manga` file). May be given as a bare leading string |
| `image_fit` | `cover` \| `contain` \| `fill` | the panel's `image_fit` (then `cover`) | How the image fits inside its placement box |
| `width` | `<n>%` \| `<n>mm` | `100%` | Placement box width. `%` is relative to the **panel** width |
| `height` | `<n>%` \| `<n>mm` | `100%` | Placement box height. `%` is relative to the **panel** height |
| `anchor_pos` | `top_left` \| `top_right` \| `bottom_left` \| `bottom_right` \| `center` \| `top` \| `bottom` \| `left` \| `right` | `center` | Which corner/edge of the panel the box is aligned to (same meaning as a balloon's `anchor_pos`) |
| `x` | `<n>%` \| `<n>mm` | none | Box top-left X, **panel-relative** (origin = panel top-left). Overrides `anchor_pos` on the X axis only |
| `y` | `<n>%` \| `<n>mm` | none | Box top-left Y, panel-relative. Overrides `anchor_pos` on the Y axis only |
| `dx`, `dy` | `<n>%` \| `<n>mm` | `0` | Fine-tuning offset applied after placement |
| `clip` | `true` \| `false` | the panel's `image_clip` (then `true`) | Clip this layer to the panel rect. See below |
| `flip_h` | `true` \| `false` | `false` | Mirror the image horizontally (left↔right) within its box |

Position and size mirror a balloon's `x`/`y`/`width`/`height`/`anchor_pos`/`dx`/`dy`,
but are **panel-relative and default to `%`** (of the panel's own size). `mm` is
also accepted; `px`/`pt` are not. A layer with no position/size attributes fills
the panel, matching the legacy single-`image` behavior.

**Clipping (breaking out of the frame).** By default (`clip: true`) a layer is
clipped to the owning panel's rect, so a character pushed to the edge cannot
spill into the gutter. Set `clip: false` on a layer to let it bleed out past the
panel border (a character breaking the frame), or set `image_clip: false` on the
panel to flip the default for all of its layers.

```manga
panel scene {
  images {
    { "bg.png" image_fit: cover }                 // background: fills the panel
    { "char.png" x: 70% width: 40% }              // overflows → clipped by default
    { "fx.png"  x: 80% width: 50% clip: false }   // this one bleeds out of the frame
  }
}
```

#### Skewing Panel Borders (Dynamic Effect)

By tilting specific borders of a panel, you can create layouts with a sense of movement.

```manga
// Tilt the left border 10 degrees clockwise
panel action {
  skew_left: 10
}

// Tilt the right border 8 degrees counterclockwise
panel impact {
  skew_right: -8
}

// Tilt both left and right borders at the same angle
panel speed {
  skew_left: 5
  skew_right: 5
}
```

**Skew Angle Direction:**
- Positive value: Clockwise
- Negative value: Counterclockwise
- Each side (left/right/top/bottom) can be specified individually

#### Offsetting Panel Position (Overlap Effect)

By offsetting a panel's position, you can create effects where it overlaps adjacent panels or breaks out of the layout grid. This is a dynamic expression technique commonly used in actual manga.

```manga
// Dynamic panel that breaks out above and below
panel impact {
  offset_top: -10     // Breaks out 10mm above
  offset_bottom: -10  // Breaks out 10mm below
}

// Panel overlapping to the right
panel overlap_right {
  offset_right: -8  // Overlaps right panel by 8mm
}

// Expand in all directions
panel full_bleed {
  offset_top: -5
  offset_bottom: -5
  offset_left: -5
  offset_right: -5
}

// Shrink inward is also possible
panel shrink {
  offset_top: 3      // Shrink 3mm from top
  offset_left: 3     // Shrink 3mm from left
}
```

**Meaning of Offset Values:**
- **Negative value**: Panel expands (breaks out in that direction)
- **Positive value**: Panel shrinks (contracts inward from that direction)
- Unit: mm (millimeters)

**Usage Examples:**
- Dynamic staging in action scenes
- Emphasizing important panels (overlaying on top of other panels)
- Bold compositions that break out of the page
- Intentionally shifting panel boundaries

**Controlling Stacking Order (z_index / importance):**

When panels overlap via offsets, the front panel is determined by:

1. `z_index` (highest priority when specified; larger = front)
2. `importance` (when z_index is omitted; compared on the same scale as 1→+1, 2→0, 3→-1)
3. Document order (ties: the later panel is drawn on top)

```manga
// Large panel behind, small panel in front
panel big_face {
  offset_bottom: 60   // bleed down over the next row
  z_index: -1         // explicitly behind
}
panel front {
  importance: 1       // derived z = +1: drawn on top
}
```

The front panel covers lower panels opaquely with its background and borders (no outline halo).

**Notes:**
- Excessively large offsets may completely cover adjacent panels

#### Selectively Omitting Borders (Emphasis Effect)

By controlling borders on individual sides, you can express the connection and flow between panels. This is a technique commonly used in actual manga.

```manga
// Omit bottom border to connect with the next row
panel flow {
  border_bottom: 0
}

// Show only top and bottom borders
panel horizontal_emphasis {
  border_left: 0
  border_right: 0
  border_top: 2
  border_bottom: 2
}

// Emphasize with thick left and right borders
panel vertical_emphasis {
  border_left: 3
  border_right: 3
  border_top: 0
  border_bottom: 0
}

// Completely borderless
panel borderless {
  border_top: 0
  border_bottom: 0
  border_left: 0
  border_right: 0
}
```

**Individual Border Control Priority:**
- If `border_top`, `border_bottom`, `border_left`, `border_right` are specified, use those values
- If not specified (`None`), use the `border` value
- Specifying `0` hides the border on that side

**Usage Examples:**
- Connect top and bottom panels to create unity
- Connect left and right panels for a sense of continuity
- Emphasize important panels with borders (thick borders)
- Omit borders on background panels (borderless)

---

### 3.4 balloon / monologue (Speech Balloons, Monologue/Narration Text)

You can place speech balloons and other text elements (inner voice, narration captions) inside a panel. These are declared **nested inside `panel { ... }`** — a koma is a scene, and its dialogue/caption text is inherently part of that scene.

`monologue` covers both inner-voice narration and narration captions. These used to be two separate node kinds, but the only real difference between them was a matter of in-story point of view (is this the character's inner voice, or the narrator's?) — not layout, since both are always a plain rectangle. They've been merged: use `background`/`text_color` to get either look (no background for an inner-voice feel, a dark caption band for narration, etc).

#### Basic Syntax

```manga
page {
  row {
    panel char_a {
      background: "#dddddd"

      balloon {
        anchor_pos: top_right
        text: "Wait up!"
        tail_angle: 225         // degrees, clockwise from 12 o'clock — points down-left, toward char_b
        shape: shout
      }
    }
    panel char_b {}
  }

  panel wide_scene {
    monologue {
      text: "And so, the incident began."
      background: "#000000"
      text_color: "#ffffff"
      x: 15
      y: 15
      width: 65
      height: 12
      z_index: 10             // draw on top of the panel border
    }
  }
}
```

`balloon` and `monologue` both take an optional ID (like `panel`) and an `{ ... }` attribute block. They cannot be written inside a `panel`'s single-line inline form (`panel small importance: 3`) — the block form is required.

#### Shared Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `text` | string | none (required) | Text to display. Supports inline `<i>…</i>` / `<b>…</b>` (see Typography below) |
| `text_direction` | `horizontal` \| `vertical` | `horizontal` | Text direction |
| `font_size` | number (mm) | `4.5` | Font size |
| `font_family` | string | (a Japanese-first sans-serif stack) | CSS-like comma-separated family list, in priority order (e.g. `"Yu Gothic, Hiragino Sans, sans-serif"`). The renderer uses the first available; supply font files to the PNG renderer for device-independent output |
| `line_height` | number \| `<n>mm` | `1.4` | Line spacing. A bare number / `%` is a multiplier of `font_size` (`1.8`, `150%`); an `mm` value is an absolute line advance |
| `letter_spacing` | number (mm) | `0` | Extra tracking between glyphs (may be negative) |
| `font_style` | `normal` \| `italic` | `normal` | Element-wide style (inline `<i>` overrides per-run) |
| `font_weight` | `normal` \| `bold` | `normal` | Element-wide weight (inline `<b>` overrides per-run) |
| `wrap` | `true` \| `false` | `true` | Auto line-wrapping. `false` disables it: text breaks **only** at explicit `\n` and is allowed to overflow, so you control every line break |
| `padding` | number (mm) | `1.5` | Inset between the box edge and the text. When `width`/`height` are omitted, the text-based size estimate is padded by this amount (the actual text area stays the same size). Increase it when text looks cramped, e.g. in a `monologue`'s edge-to-edge rectangle |
| `x` | number (mm) | none | Absolute position (page coordinates): top-left X. Overrides the X axis only — set alone, `y` still follows `anchor_pos` |
| `y` | number (mm) | none | Absolute position (page coordinates): top-left Y. Overrides the Y axis only — set alone, `x` still follows `anchor_pos` |
| `width` | number (mm) | auto-estimated from text | Width |
| `height` | number (mm) | auto-estimated from text | Height |
| `anchor_pos` | `top_left` \| `top_right` \| `bottom_left` \| `bottom_right` \| `center` \| `top` \| `bottom` \| `left` \| `right` | `top_right` (balloon) / `top_right` (monologue) | Which corner/edge of the **owning panel** to use as the reference point |
| `margin` | number (mm) | `3` | Inset from the panel border, applied along the direction the box grows from `anchor_pos`. `0` makes it sit flush against the border. Has no effect with `anchor_pos: center` or other anchors with no single growth direction |
| `dx`, `dy` | number (mm) | `0` | Fine-tuning offset from the reference position (applied after `margin`) |
| `z_index` | int | none (100 if omitted) | Stacking order, compared on the same scale as a panel's `z_index`/`importance`. When omitted, always renders above panel borders |
| `background` | color | varies by kind | Fill color |
| `border_color` | color | `"#000000"` | Outline color |
| `border` | number (mm) | varies by kind | Outline width |
| `align` | `start` \| `center` \| `end` | `start` | Text alignment |

**How positioning works:** `anchor_pos` picks which corner/edge of **the panel this element is nested inside** to use as the reference point. The element's box then grows from that point **toward the inside of the panel** — e.g. `top_right` aligns the box's top-right corner with the owning panel's top-right corner, so the box grows down and to the left, into the panel. `margin` (default 3mm) nudges that reference point further along the same growth direction, so the balloon doesn't sit flush against the panel border. Setting `x` and/or `y` uses an absolute page coordinate for that axis instead — each overrides independently, so `y: 200` alone pushes the box down while `x` keeps following `anchor_pos` (useful for a caption band that straddles multiple panels, or to pin one axis while leaving the other automatic). `margin` still applies to an overridden axis too, nudging it toward the owning panel's centre on that axis.

**On text overflow:** when `width`/`height` are omitted, the box size is a rough estimate based on character count — not an accurate layout calculation. If the text is too long for the box, it is **drawn overflowing rather than auto-shrunk**. Set `width`/`height`/`font_size` explicitly if the estimate doesn't fit.

**Typography & inline markup:**

- `font_family` / `line_height` / `letter_spacing` control the whole element; `font_style` / `font_weight` set element-wide italic/bold.
- Use inline tags for partial emphasis: `<i>…</i>` (italic) and `<b>…</b>` (bold), case-insensitive and nestable. Write a literal `<` as `\<`.

```manga
balloon {
  text: "That was <b>absolutely</b> <i>not</i> the plan."
  font_family: "Yu Gothic, sans-serif"
  line_height: 1.7
  letter_spacing: 0.3
}
```

- **`wrap: false`** turns off automatic line-wrapping. The text then breaks only where you put a newline (`\n` in the string) and is allowed to overflow the box — handy for a single-line caption where automatic wrapping would break at the wrong place. With `wrap: true` (the default), lines wrap to fit the box (word boundaries for spaced text, anywhere for CJK).

```manga
monologue {
  // Breaks only at the newline; each line may run past the box edge.
  text: "FRED LISTED EVERY PROJECT
HE BELIEVED I'D MISSED IN NEW YORK"
  wrap: false
}
```

#### balloon-specific Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `shape` | `oval` \| `shout` \| `whisper` \| `jagged` \| `explosion` \| `thought` \| `rounded_box` | `oval` | Outline shape |
| `aspect_ratio` | number | none (keeps the text-based estimate) | Overrides the balloon's bounding-box height÷width ratio. Applies uniformly to every shape. If neither `width` nor `height` is set, keeps the estimated box's area roughly constant while changing its proportions; if exactly one of `width`/`height` is set, that dimension is treated as an absolute size and the other is derived from it (see below) |
| `corner_radius` | number (mm) | `3` | Corner radius. Only used when `shape: rounded_box` |
| `inner_ratio` | number (0-1) | none (per-shape default) | Valley (inner vertex) depth for `shape: shout`/`jagged`/`explosion`, as a fraction of the spike radius — lower means deeper valleys and more dramatic spikes. Per-vertex jitter (see `jitter` below) is kept around whatever value is in effect, so the hand-drawn irregularity doesn't disappear. Omit to use each shape's built-in centre (`shout`/`explosion`: 0.625, `jagged`: 0.765) |
| `jitter` | number | `1` | Strength of the hand-drawn outline wobble, as a multiplier on the built-in jitter amount. `1` is the original amount, `0` gives a perfectly clean geometric outline (no wobble), values above `1` exaggerate it. Scales the radius wobble for `oval`/`whisper`/`thought` and the per-vertex valley jitter width for `shout`/`jagged`/`explosion` (independent of `inner_ratio`, which only shifts the jitter's centre). No effect on `rounded_box`, which never has jitter |
| `tail_angle` | number (degrees) | `270` | Direction the tail points, clock convention: `0` = up (12 o'clock), clockwise — `90` = right (3 o'clock), `180` = down, `270` = left (9 o'clock, the default — points back toward the panel's own content for the common `anchor_pos: top_right` placement) |
| `tail_length` | number (mm) | `5.6` | Tail length |
| `background` | color | `"#ffffff"` | Balloon fill color |
| `border` | number (mm) | `0.45` | Outline width. Larger values draw a thicker line, smaller values a thinner one (e.g. `border: 0.2` for thin, `border: 1.0` for bold) |

**Shape variants:**

| `shape` | Use case | Appearance |
|---|---|---|
| `oval` | Regular dialogue | Ellipse |
| `shout` | Shouting / strong emotion | Jagged star, straight edges on both sides of every spike (larger spikes) |
| `whisper` | Whispering / weak delivery | Dashed-outline ellipse |
| `jagged` | Robotic voice, phone/speaker, etc. | Jagged star, straight edges (sharper points) |
| `explosion` | Impact / explosion effect | Same spiky silhouette as `shout`, but the valleys between spikes are soft curves instead of straight edges — a classic comic-explosion burst |
| `thought` | Inner voice (balloon-style) | Ellipse + a trail of shrinking circles instead of a tail |
| `rounded_box` | Stylised/SD-style dialogue | Rounded rectangle (use `corner_radius` to tune the roundness) |

Shape outlines use a fixed-parameter, simplified implementation — point count and amplitude are not user-tunable (future extension). `aspect_ratio` works with every shape — e.g. setting it on `shout` produces a tall, narrow shout balloon.

**Combining `aspect_ratio` with `width`/`height`:**

| Given | Behavior |
|---|---|
| `aspect_ratio` alone | Keeps the text-estimated box's area constant, changing only its height÷width ratio to `aspect_ratio` |
| `width` + `aspect_ratio` (no `height`) | Fixes width to the given absolute value; height = `width × aspect_ratio` |
| `height` + `aspect_ratio` (no `width`) | Fixes height to the given absolute value; width = `height ÷ aspect_ratio` |
| Both `width` and `height` | `aspect_ratio` is ignored; the given `width`/`height` are used as-is |

```manga
balloon {
  shape: shout
  width: 20         // fix width at 20mm
  aspect_ratio: 2.0  // height = 20 * 2.0 = 40mm
  text: "..."
}
```

```manga
panel hero_panel {
  balloon {
    anchor_pos: top_right
    text: "That's far enough!"
    aspect_ratio: 1.8
    tail_angle: 200   // slightly left of straight down
    shape: shout
  }
}
```

#### monologue-specific Attributes

`monologue` is always a plain rectangle — it does not support `shape` (balloon outlines).

| Attribute | Type | Default | Description |
|---|---|---|---|
| `background` | color | `transparent` | Fill color. Leave it `transparent` for an inner-voice feel, or set something like `"#000000"` for a narration caption band |
| `text_color` | color | `"#000000"` | Text color. Set to something like `"#ffffff"` when using a dark background |
| `border` | number (mm) | `0` | No border by default |

As an inner-voice monologue:

```manga
panel hero_panel {
  monologue {
    anchor_pos: bottom_left
    text: "I had that dream again."
  }
}
```

Since `monologue` fills its rectangle edge-to-edge, longer text can look cramped. Increase `padding` to add breathing room:

```manga
monologue {
  anchor_pos: top_right
  text: "This is getting troublesome..."
  padding: 4
}
```

As a narration caption. Combine with absolute `x`/`y`/`width`/`height` placement to get a band that can be **overlaid on top of a panel's border** (with `z_index` omitted, it always renders above panels):

```manga
panel scene {
  monologue {
    text: "Three days later—"
    background: "#000000"
    text_color: "#ffffff"
    x: 10
    y: 10
    width: 50
    height: 12
  }
}
```

---

## 4. Comments

### Single-Line Comments

```manga
// This is a single-line comment
panel hero  // End-of-line comments are also possible
```

### Multi-Line Comments

```manga
/*
  This is a
  multi-line comment
*/
```

---

## 5. Data Types

### Identifiers

- Pattern: `[a-zA-Z_][a-zA-Z0-9_]*`
- Examples: `hero`, `panel_1`, `_temp`

### Numbers

- Integers: `40`, `100`
- Decimals: `40.5`, `3.14`
- Negative numbers: `-10`, `-5.5`

### Numbers with Units

- mm: `40mm`, `100mm`
- px: `800px`
- pt: `72pt`
- Percentage: `40%`, `50.5%`

### Strings

- Enclosed in double quotes: `"hello"`
- Escape sequences:
  - `\"` - Double quote
  - `\\` - Backslash
  - `\n` - Newline

### Colors

- Hexadecimal color codes: `"#ff0000"`, `"#rgb"`, `"#rrggbb"`
- Named colors: `"red"`, `"blue"` (implementation-dependent)

---

## 6. Usage Examples

### Example 1: Simple Single Panel

```manga
page {
  panel hero
}
```

### Example 2: Two-Row Layout

```manga
page {
  gutter: 8

  row height: 60% {
    panel top
  }
  row {
    panel bottom
  }
}
```

### Example 3: Four-Panel Comic

```manga
page yonkoma {
  size: B5
  direction: rtl
  gutter: 6
  padding: 15

  row height: 25% {
    panel panel1 {
      image: "scenes/scene1.png"
      text: "Introduction"
    }
  }
  row height: 25% {
    panel panel2 {
      image: "scenes/scene2.png"
      text: "Development"
    }
  }
  row height: 25% {
    panel panel3 {
      image: "scenes/scene3.png"
      text: "Turn"
    }
  }
  row {
    panel panel4 {
      image: "scenes/scene4.png"
      text: "Conclusion"
      importance: 1
    }
  }
}
```

### Example 4: 2×2 Grid

```manga
page {
  row {
    col { panel p1 }
    col { panel p2 }
  }
  row {
    col { panel p3 }
    col { panel p4 }
  }
}
```

### Example 5: Irregular Layout

```manga
page action_scene {
  direction: rtl
  gutter: 5

  row height: 60% {
    panel hero {
      importance: 1
      image: "hero_big.png"
    }
  }
  row {
    col { panel detail1 }
    col { panel detail2 }
    col { panel detail3 }
  }
}
```

### Example 6: Complex Nesting

```manga
page complex {
  row height: 50% {
    col width: 60% {
      panel main {
        importance: 1
      }
    }
    col {
      row {
        panel sub1
      }
      row {
        panel sub2
      }
    }
  }
  row {
    col { panel bottom1 }
    col { panel bottom2 }
    col { panel bottom3 }
  }
}
```

### Example 7: Practical Example with Images

```manga
page story {
  size: B5
  gutter: 5

  // Create atmosphere with background image
  row height: 40% {
    panel establishing_shot {
      image: "backgrounds/city.jpg"
      image_fit: cover
      importance: 1
    }
  }

  // Character-focused panels
  row height: 30% {
    col {
      panel char1 {
        image: "characters/hero.png"
        image_fit: contain
        border: 2
      }
    }
    col {
      panel char2 {
        image: "characters/rival.png"
        image_fit: contain
        border: 2
      }
    }
  }

  // Reaction panel
  row {
    panel reaction {
      image: "effects/surprise.png"
      image_fit: cover
    }
  }
}
```

### Example 8: Dynamic Layout (Using skew)

```manga
page action {
  gutter: 6

  // Top row: Tilt left and right sides to create parallelogram
  row height: 40% {
    panel impact {
      importance: 1
      skew_left: 8
      skew_right: 8
    }
  }

  // Middle row: Tilt each panel in opposite directions
  row height: 30% {
    col {
      panel reaction1 {
        skew_right: -5
      }
    }
    col {
      panel reaction2 {
        skew_left: -5
      }
    }
  }

  // Bottom row: Normal arrangement
  row {
    panel aftermath
  }
}
```

### Example 9: Skew on col/row (Diagonal Boundaries for Column Layouts)

Applying skew to an entire column lets you tilt the boundary for all panels inside it at once.

```manga
page {
  gutter: 6
  border: 1

  row {
    col {
      skew_right: -6    // Tilt the right boundary of the left column
      panel left1 {}
    }
    col {
      row { panel right1 {} }
      row { panel right2 {} }
    }
  }
}
```

The gutter between the two columns is rendered as two parallel diagonal lines. The gutter between `right1` and `right2` inside the right column is rendered as a normal horizontal gap.

### Example 10: Flashback Scene (Dark Gutter)

Setting `gutter_color` to a dark color fills both the gutters between panels and the padding margins around the page with that color. This is the standard technique used in manga flashback or dream sequences.

```manga
page {
  gutter: 6
  padding: 10
  border: 1
  gutter_color: black   // All areas outside panels become black

  row { panel scene1 {} }
  row { panel scene2 {} }
  row { panel scene3 {} }
}
```

- `gutter_color` accepts both named colors (`black`, `gray`, `white`) and hex codes (`"#000000"`)
- The default is `"#ffffff"` (white), matching normal manga pages
- Panel backgrounds (`background`) remain independent — set `background: "#e0e0e0"` on individual panels to give them a gray tint for the flashback effect

---

## 7. Best Practices

### Naming Conventions

- Use panel IDs that represent content: `hero`, `villain`, `background`
- Use page names that represent purpose: `main_layout`, `title_page`

### Layout Design

1. First, divide vertically using `row` for the main structure
2. Divide horizontally using `col` as needed
3. Specify sizes starting with the most important panels
4. Don't overuse `%` specifications (utilize auto)
5. **Dynamic Effect**: Use `skew` to tilt panels in action scenes (recommended: -10 to +10 degrees)

### Using Images

1. **Directory Structure**: Organize images in dedicated folders (e.g., `images/`, `assets/`)
2. **Choosing image_fit**:
   - Backgrounds/Landscapes → `cover` (fill the screen)
   - Characters/Objects → `contain` (show the whole)
   - Textures/Patterns → `fill` (stretch)
3. **File Size**: Avoid excessively large images (recommended: under 2MB)
4. **Format**: Use PNG (transparency support), JPEG (photos), SVG (vector) appropriately

### Readability

- Use proper indentation (2 spaces or 4 spaces)
- Add comments for each section
- Separate long files with blank lines

---

## 8. Common Errors

### Syntax Errors

```
Parse error: Unexpected token at line 10, column 5
Expected one of: row, col, panel
```

→ Syntax is incorrect. Check the position of braces and colons.

### Percentage Overflow Error

```
Layout error: Percentage total (110%) exceeds 100%
```

→ The sum of `%` specifications within the same level exceeds 100%.

### Duplicate Panel ID Error

```
Validation error: Duplicate panel ID 'hero'
```

→ Multiple panels with the same ID are defined. Use unique IDs.

### Image File Errors

```
Warning: Image file not found: 'assets/hero.png'
```

→ The specified image file cannot be found. Check if the path is correct.

```
Error: Unsupported image format: 'image.bmp'
```

→ Unsupported image format. Use PNG, JPEG, GIF, or SVG.

---

## 9. CLI Tool: `transpose`

`transpose` is a CLI subcommand (not DSL syntax) that mirrors a `.manga` file
**left↔right**, converting between right-opening (`rtl`, Japanese manga) and
left-opening (`ltr`, Western comics) layouts. It rewrites only the attributes
that carry a left/right meaning and copies everything else verbatim; running it
twice returns the original (it is an involution).

```bash
manga-composer transpose <input.manga> [options]
```

### What it mirrors (by default)

- Page `direction` (`rtl`⇄`ltr`) and `padding_left`⇄`padding_right`
- `align` (`start`⇄`end`) and `anchor_pos` left↔right (e.g. `top_left`⇄`top_right`)
- `skew_left`⇄`skew_right` (and sign-flips every skew), `offset_left`⇄`offset_right`,
  `border_left`⇄`border_right`, `margin_left`⇄`margin_right`
- `dx` sign-flip, image-layer `flip_h` toggle, balloon `tail_angle`
- `x` coordinates in `%` (and absolute balloon `x` when `width` is explicit)

Text orientation (`text_direction` vertical⇄horizontal) is **NOT** changed unless
you pass `--text`. Layout-dependent coordinates that can't be mirrored without a
full layout pass (auto-width absolute `x`, panel-relative `mm` `x`) are kept as-is
with a warning.

### Common options

| Option | Default | Meaning |
|---|---|---|
| `-o, --output <file>` | stdout | Transposed `.manga` output |
| `--out-image <file>` | — | Also render the result to a `.png`/`.svg` (one-step visual check) |
| `--direction <flip\|ltr\|rtl>` | `flip` | Invert, or force a target (no-op if already there) |
| `--text` | off | Also swap `text_direction` vertical⇄horizontal |
| `--no-flip-images` / `--no-skew` / `--no-tail` / `--no-align` | (on) | Disable that part of the mirror |
| `--keep-coords` | off | Don't mirror any `x` coordinates |
| `--dry-run` | off | Report what would change; write nothing |

Run `manga-composer transpose --help` for the full list. The `-o` source and
`--out-image` image can be produced together in one command:

```bash
# Transposed source AND a preview image in one step
manga-composer transpose in.manga -o out.manga --out-image out.png

# Convert a right-opening book to left-opening, text turned horizontal
manga-composer transpose book_rtl.manga --text -o book_ltr.manga --out-image book_ltr.png
```

Without a build, run it straight from the TypeScript source (see README):

```bash
npx tsx src/cli.ts transpose in.manga -o out.manga --out-image out.png
```

---

**MangaDSL Language Reference v1.2**
Last updated: 2026-08-18
