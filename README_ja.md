# manga-composer

漫画のコマ割りレイアウトを宣言的に記述するためのDSL（ドメイン固有言語）とコンパイラです。`.manga` ファイルを書いて **SVG** または **PNG** にコンパイルできます。

manga-composer は Python 製ライブラリ `manga-gen` を TypeScript に移植したものです。CLI としてもプログラム用ライブラリとしても利用できます。

> The English version is available at [README.md](README.md).

## 特長

- **宣言的レイアウト** — `row` / `col` / `panel` でページを分割。任意の深さにネスト可能。
- **柔軟なサイズ指定** — `%`、`mm`、`auto` を混在できます。
- **読み順** — 左→右（`ltr`）または右→左（`rtl`、日本語漫画向け）。
- **画像** — PNG / JPEG / GIF / SVG をパネル内に埋め込み。`cover` / `contain` / `fill` に対応。
- **ダイナミックな演出** — パネルの枠を傾ける（`skew_*`）、パネルを重ねる（`offset_*`、`z_index`）ことでアクションシーンを表現。
- **個別辺ボーダー** — 各辺を独立して制御。
- **吹き出し・独白** — `panel` の中にネストする `balloon` / `monologue`。複数の形状（oval, shout, whisper, jagged, explosion, thought, rounded_box）に対応。
- **標準ページサイズ** — A3, A4, B4, B5 に加え、カスタム `WxH` サイズ。
- **SVG / PNG 出力** — SVG は内蔵レンダラー、PNG は [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) を使用。

## インストール

```bash
npm install -g manga-composer
```

グローバルインストールせずに実行する場合:

```bash
npx manga-composer input.manga -o output.svg
```

プロジェクト内でライブラリとして使う場合:

```bash
npm install manga-composer
```

## クイックスタート

### 1. `.manga` ファイルを書く

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

### 2. コンパイルする

```bash
# PNG 出力（デフォルト）
manga-composer simple.manga

# SVG 出力
manga-composer simple.manga -o output.svg

# 高解像度 PNG
manga-composer simple.manga -o print.png --dpi 600
```

## CLI の使い方

```
manga-composer <input> [options]

引数:
  input                 .manga ソースファイルのパス

オプション:
  -o, --output <file>   出力ファイル（.png または .svg）
  --format <fmt>        出力フォーマット: png | svg | auto
                        （デフォルト: 出力拡張子から自動判定）
  --dpi <n>             PNG 出力の DPI
                        （デフォルト: DSL の dpi 設定、または 300）
  -h, --help            ヘルプを表示
```

- `-o` を省略した場合、入力ファイル名の拡張子を `.png` に変えたパスが出力先になります。
- `--format auto`（デフォルト）では、出力ファイルの拡張子からフォーマットを判定します。
- `.manga` 内の画像パスは、その `.manga` ファイルからの相対パスとして解決されます。

## プログラム用 API

```ts
import { compileToSvg, parse, LayoutEngine, SVGRenderer } from "manga-composer";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

const path = "simple.manga";
const source = readFileSync(path, "utf-8");

// 一括: ソース → SVG 文字列
const svg = compileToSvg(source, dirname(path));

// または段階ごとに実行:
const page = parse(source);
const engine = new LayoutEngine(page);
const panels = engine.layout();
const renderer = new SVGRenderer(page, panels, engine.speeches, dirname(path));
const svg2 = renderer.render();
```

SVG を PNG にラスタライズする:

```ts
import { svgToPng } from "manga-composer";

const png = svgToPng(svg, { dpi: 300, widthMm: page.config.widthMm });
```

## DSL リファレンス

### ページ（page）

```manga
page 任意の名前 {
  size: A4            // A3 | A4 | B4 | B5 | <W>x<H> | <W>x<H>px
  direction: ltr      // ltr | rtl
  gutter: 5           // パネル間の隙間（mm）
  padding: 10         // ページ外周マージン（mm）。padding_top/bottom/left/right で個別上書き
  background: "#ffffff"
  gutter_color: "#ffffff"  // ガター・マージンの色（回想シーンなら black など）
  dpi: 300
  border: 1           // 全パネルのデフォルト枠線幅（mm）
  border_color: "#000000"
}
```

標準サイズ（mm）: A3 = 297×420、A4 = 210×297、B4 = 257×364、B5 = 182×257。
カスタムサイズは `<W>x<H>`（mm）または `<W>x<H>px`。

### レイアウト: row / col

`row` は縦方向のスペースを確保し、その中で子要素を横に並べます。`col` は横方向のスペースを確保し、その中で子要素を縦に並べます。

```manga
row height: 40% { ... }   // 親要素に対する比率
row height: 60mm { ... }  // 絶対指定
row { ... }               // auto: 残りのスペースを均等割り

col width: 30% { ... }
```

属性: `height`（row）/ `width`（col）、`gutter`、`align`（`start`/`center`/`end`）、`margin_top`/`margin_bottom`/`margin_left`/`margin_right`、`skew_left`/`skew_right`/`skew_top`/`skew_bottom`（子パネルに継承）。

### パネル（panel）

```manga
panel my_panel                          // 最小記法
panel hero importance: 1, border: 2     // 一行記法
panel quiet {                           // ブロック記法
  image: "assets/hero.png"
  image_fit: cover
  background: "#f0f0f0"
}
```

主な属性:

| 属性 | 値 | 説明 |
|---|---|---|
| `importance` | `1` \| `2` \| `3` | 重要度（1 が最重要）。重なり順の既定値にもなる |
| `z_index` | 整数 | 重なり順（大きいほど前面）。`importance` を上書き |
| `image` | パス | パネル内に配置する画像 |
| `image_fit` | `cover` \| `contain` \| `fill` | 画像の収め方 |
| `text` / `text_direction` | 文字列 / `horizontal`\|`vertical` | パネル内テキスト |
| `label` | 文字列 | 中央に表示するラベル（設計時に便利） |
| `border` / `border_color` | 数値 / 色 | 枠線の太さと色 |
| `border_top`/`bottom`/`left`/`right` | 数値 | 各辺の太さ（`0` で非表示） |
| `background` | 色 | パネル背景色 |
| `skew_left`/`right`/`top`/`bottom` | 度 | 辺を傾ける |
| `offset_top`/`bottom`/`left`/`right` | mm | 負で拡張（はみ出す）、正で縮小 |

### 吹き出し・独白（balloon / monologue）

`balloon` と `monologue` は `panel { ... }` ブロックの中にネストして書きます。

```manga
panel char_a {
  balloon {
    anchor_pos: top_right
    text: "待って！"
    shape: shout
    tail_angle: 225   // 度。12時方向から時計回り
  }
  monologue {
    text: "こうして事件は始まった。"
    background: "#000000"
    text_color: "#ffffff"
    x: 15
    y: 15
  }
}
```

`balloon` の形状: `oval`, `shout`, `whisper`, `jagged`, `explosion`, `thought`, `rounded_box`。`monologue` は常に矩形です（`background` / `text_color` で独白風・ナレーション帯風を作り分けます）。

### コメント

```manga
// 単一行コメント
/* 複数行
   コメント */
```

移植元の完全な仕様は [`manga-gen-python/docs/`](manga-gen-python/docs/) ディレクトリ（`DSL.md`、`SPEC.md`）を参照してください。

## 開発

```bash
npm install          # 依存関係のインストール
npm run build        # TypeScript を dist/ にコンパイル
npm run cli -- file.manga -o out.svg   # ビルドせず CLI を実行（tsx 経由）
npm test             # 単体テスト（vitest）
npm run compare      # Python 参照実装との出力比較（下記参照）
```

### Python 参照実装との照合

本移植は、オリジナルの Python 版 `manga-gen` が生成する参照 SVG と、TS 版の SVG 出力を比較することで検証しています。

```bash
npm run compare              # examples2/（受け入れ基準のコーパス）を比較
npm run compare -- --all     # examples/ も比較
npm run compare -- --png     # PNG のピクセル差分も実行（参考情報）
npm run generate-references  # 参照 SVG を再生成（Python CLI が必要）
```

比較は主に構造的（要素ツリー＋数値属性の許容誤差付き比較）です。吹き出しの輪郭は、手描き風のゆらぎに Python 版とは異なる（ただし内部的には決定論的な）PRNG を使っているため、バウンディングボックスのレベルで比較しています。詳細は [`docs/PORTING_NOTES.md`](docs/PORTING_NOTES.md) を参照してください。

## ライセンス

MIT — [LICENSE](LICENSE) を参照してください。
