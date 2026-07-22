# MangaDSL 言語リファレンス

漫画のコマ割りレイアウトを宣言的に記述するドメイン特化言語（DSL）のリファレンスガイド。

---

## 1. 基本情報

### ファイル拡張子

`.manga`

### 文字エンコーディング

UTF-8

---

## 2. ページ宣言

### 基本構文

```manga
page {
  // ページ属性
  size: A4
  direction: rtl
  gutter: 8
  padding: 20
  background: "#ffffff"
  dpi: 300

  // レイアウト文
  // ...
}
```

### 名前付きページ（オプション）

```manga
page main_layout {
  // ...
}
```

### ページ属性

| 属性 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `size` | `A3` \| `A4` \| `B4` \| `B5` \| `<W>x<H>` | `A4` | ページサイズ |
| `direction` | `rtl` \| `ltr` | `ltr` | 読み順（右→左 or 左→右） |
| `gutter` | number (mm) | `5` | パネル間の隙間 |
| `padding` | number (mm) | `10` | ページ外周マージン |
| `background` | color | `"#ffffff"` | ページ背景色 |
| `dpi` | number | `300` | PNG出力時の解像度 |
| `border` | number (mm) | `1` | 全パネルのデフォルト枠線の太さ |
| `border_color` | color | `"#000000"` | 全パネルのデフォルト枠線色 |
| `gutter_color` | color | `"#ffffff"` | コマ間（ガター）およびページマージン（コマ外）の色 |

#### サイズ規定値

| サイズ | 幅×高さ (mm) |
|--------|-------------|
| A3 | 297 × 420 |
| A4 | 210 × 297 |
| B4 | 257 × 364 |
| B5 | 182 × 257 |

#### カスタムサイズ指定

```manga
page {
  size: 150x200  // 幅150mm × 高さ200mm
}
```

---

## 3. レイアウト要素

### 3.1 row（行）

縦方向の領域を確保し、その中の子要素を横方向に配置するコンテナ。

#### 基本構文

```manga
row {
  // 子要素（col, panel, row）
}
```

#### 高さ指定

```manga
// 比率指定（親要素の40%）
row height: 40% {
  // ...
}

// 絶対指定（60mm）
row height: 60mm {
  // ...
}

// 省略（残りスペースを均等割り）
row {
  // ...
}

```

#### 属性

| 属性 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `height` | `<n>%` \| `<n>mm` \| 省略 | auto | 高さ |
| `gutter` | number (mm) | 継承 | この階層内のガター |
| `align` | `start` \| `center` \| `end` | `start` | 余白がある場合の配置 |
| `margin_top` | number (mm) | `0` | 上側のマージン |
| `margin_bottom` | number (mm) | `0` | 下側のマージン |
| `margin_left` | number (mm) | `0` | 左側のマージン |
| `margin_right` | number (mm) | `0` | 右側のマージン |
| `skew_left` | number (度) | `0` | 左境界の傾斜角度（内包パネルに継承） |
| `skew_right` | number (度) | `0` | 右境界の傾斜角度（内包パネルに継承） |
| `skew_top` | number (度) | `0` | 上境界の傾斜角度（内包パネルに継承） |
| `skew_bottom` | number (度) | `0` | 下境界の傾斜角度（内包パネルに継承） |

### 3.2 col（列）

横方向の領域を確保し、その中の子要素を縦方向に配置するコンテナ。

#### 基本構文

```manga
col {
  // 子要素（row, panel, col）
}
```

#### 幅指定

```manga
// 比率指定（親要素の30%）
col width: 30% {
  // ...
}

// 絶対指定（50mm）
col width: 50mm {
  // ...
}

// 省略（残りスペースを均等割り）
col {
  // ...
}

```

#### 属性

| 属性 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `width` | `<n>%` \| `<n>mm` \| 省略 | auto | 幅 |
| `gutter` | number (mm) | 継承 | この階層内のガター |
| `align` | `start` \| `center` \| `end` | `start` | 余白がある場合の配置 |
| `margin_top` | number (mm) | `0` | 上側のマージン |
| `margin_bottom` | number (mm) | `0` | 下側のマージン |
| `margin_left` | number (mm) | `0` | 左側のマージン |
| `margin_right` | number (mm) | `0` | 右側のマージン |
| `skew_left` | number (度) | `0` | 左境界の傾斜角度（内包パネルに継承） |
| `skew_right` | number (度) | `0` | 右境界の傾斜角度（内包パネルに継承） |
| `skew_top` | number (度) | `0` | 上境界の傾斜角度（内包パネルに継承） |
| `skew_bottom` | number (度) | `0` | 下境界の傾斜角度（内包パネルに継承） |

#### col への skew 指定（列全体の境界を傾ける）

`col` に `skew_right` を指定すると、その列の右境界が傾き、内包するすべてのパネルに継承されます。これにより、列内のパネルを個別に設定しなくても、列単位で斜め境界を表現できます。

```manga
page {
  gutter: 6
  border: 1

  row {
    col {
      skew_right: -6        // この列の右境界を-6度傾ける
      panel left1 {}        // left1の右辺に-6度の傾きが適用される
    }
    col {
      row { panel right1 {} }   // right1の左辺にも同じ傾きが適用
      row { panel right2 {} }   // right2も同様
    }
  }
}
```

**ポイント:**
- `col` の `skew_right` は、その列の右境界と隣接する列の左境界の**両方**に影響します
- 列内に複数の `row` がある場合、すべてのパネルに傾きが継承されます
- コマ間（ガター）は、傾いた境界線2本の間の空白として自動的に表現されます

### 3.3 panel（パネル）

漫画のコマ（フレーム）を表す葉要素。

#### 基本構文

```manga
// 最小形式
panel my_panel

// 一行属性形式
panel hero importance: 1, border: 2

// ブロック形式
panel quiet {
  importance: 2
  image: "assets/hero.png"
  border: 1
  background: "#f0f0f0"
}
```

#### パネル属性

| 属性 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `importance` | `1` \| `2` \| `3` | `2` | 重要度（1が最重要）。重なり順の既定値にも使われる |
| `z_index` | int（負も可） | なし | 重なり順（大きいほど前面）。省略時は importance から導出（1→+1, 2→0, 3→-1） |
| `label` | string | なし | パネル内に表示するラベル。省略時は非表示。空文字列 `""` 指定でパネルIDを表示 |
| `image` | string (path) | なし | パネル内画像のパス |
| `image_fit` | `cover` \| `contain` \| `fill` | `cover` | 画像の収め方 |
| `text` | string | なし | パネル内テキスト |
| `text_direction` | `horizontal` \| `vertical` | `horizontal` | 文字方向 |
| `border` | number (mm) | `1` | 枠線の太さ（全辺共通） |
| `border_color` | color | `"#000000"` | 枠線色 |
| `border_top` | number (mm) | `None` | 上辺の枠線の太さ（0=非表示） |
| `border_bottom` | number (mm) | `None` | 下辺の枠線の太さ（0=非表示） |
| `border_left` | number (mm) | `None` | 左辺の枠線の太さ（0=非表示） |
| `border_right` | number (mm) | `None` | 右辺の枠線の太さ（0=非表示） |
| `background` | color | `"#ffffff"` | パネル背景色 |
| `skew_left` | number (度) | `0` | 左辺の罫線の傾斜角度 |
| `skew_right` | number (度) | `0` | 右辺の罫線の傾斜角度 |
| `skew_top` | number (度) | `0` | 上辺の罫線の傾斜角度 |
| `skew_bottom` | number (度) | `0` | 下辺の罫線の傾斜角度 |
| `offset_top` | number (mm) | `0` | 上辺の位置オフセット（負=拡大） |
| `offset_bottom` | number (mm) | `0` | 下辺の位置オフセット（負=拡大） |
| `offset_left` | number (mm) | `0` | 左辺の位置オフセット（負=拡大） |
| `offset_right` | number (mm) | `0` | 右辺の位置オフセット（負=拡大） |

#### 画像の指定

パネル内に画像を配置する場合、`image` 属性で相対パスを指定します。

```manga
panel hero {
  image: "assets/hero.png"
  image_fit: cover
}
```

**パス指定のルール:**
- `.manga` ファイルからの相対パス
- サポート形式: PNG, JPEG, GIF, SVG
- 例: `"./images/scene1.png"`, `"../assets/hero.jpg"`

**image_fit オプション:**
- `cover`: アスペクト比を保ちつつパネル全体を覆う（はみ出た部分は切り取り）
- `contain`: アスペクト比を保ちつつパネル内に収める（余白が生じる可能性あり）
- `fill`: アスペクト比を無視してパネル全体に引き伸ばす

```manga
// カバー（デフォルト）- 画像がパネルを埋め尽くす
panel p1 {
  image: "bg.jpg"
  image_fit: cover
}

// コンテイン - 画像全体が見える
panel p2 {
  image: "character.png"
  image_fit: contain
}

// フィル - 引き伸ばして完全に埋める
panel p3 {
  image: "texture.png"
  image_fit: fill
}
```

#### コマの罫線を斜めにする（躍動感の演出）

パネルの特定の罫線を傾けることで、動きのあるレイアウトを表現できます。

```manga
// 左の罫線を時計回りに10度傾ける
panel action {
  skew_left: 10
}

// 右の罫線を反時計回りに8度傾ける
panel impact {
  skew_right: -8
}

// 左右の罫線を同じ角度で傾ける
panel speed {
  skew_left: 5
  skew_right: 5
}
```

**傾斜角度の方向:**
- 正の値：時計回り
- 負の値：反時計回り
- 各辺（left/right/top/bottom）を個別に指定可能

#### コマの位置をずらす（重なり効果）

パネルの位置をオフセットすることで、隣接するコマに重ねたり、レイアウトグリッドから飛び出す効果を実現できます。実際のマンガでよく使われるダイナミックな表現手法です。

```manga
// 上下に飛び出す迫力のあるコマ
panel impact {
  offset_top: -10     // 上に10mm飛び出す
  offset_bottom: -10  // 下に10mm飛び出す
}

// 右に重なるコマ
panel overlap_right {
  offset_right: -8  // 右のコマに8mm重なる
}

// 左右上下すべてに拡張
panel full_bleed {
  offset_top: -5
  offset_bottom: -5
  offset_left: -5
  offset_right: -5
}

// 内側に縮めることも可能
panel shrink {
  offset_top: 3      // 上から3mm縮む
  offset_left: 3     // 左から3mm縮む
}
```

**オフセット値の意味:**
- **負の値**: パネルが拡大（その方向に飛び出す）
- **正の値**: パネルが縮小（その方向から内側に縮む）
- 単位: mm（ミリメートル）

**使用例:**
- アクションシーンでの迫力ある演出
- 重要なコマを強調（他のコマの上に重ねる）
- ページからはみ出すような大胆な構図
- コマとコマの境界を意図的にずらす

**重なり順の制御（z_index / importance）:**

offset で他のコマに重なったとき、前面に描かれるコマは次の優先順で決まります:

1. `z_index`（指定があれば最優先。大きいほど前面）
2. `importance`（z_index 省略時。1→+1, 2→0, 3→-1 として同じスケールで比較）
3. 記述順（同値の場合、後に記述されたコマが前面）

```manga
// 背面に大ゴマ、前面に小ゴマを重ねる
panel big_face {
  offset_bottom: 60   // 下段に断ち切りで拡大
  z_index: -1         // 明示的に背面へ
}
panel front {
  importance: 1       // 導出 z = +1: 前面に重なる
}
```

前面のコマは背景＋枠線で下のコマを不透明に覆います（縁取りは付きません）。

**注意事項:**
- 大きすぎるオフセットは隣接するコマを完全に覆い隠す可能性があります

#### 罫線を選択的に省略する（メリハリの演出）

個別の辺ごとに罫線を制御することで、コマの繋がりや流れを表現できます。実際のマンガでよく使われる手法です。

```manga
// 下の罫線を省略して次の行と繋げる
panel flow {
  border_bottom: 0
}

// 上下のみ罫線を表示
panel horizontal_emphasis {
  border_left: 0
  border_right: 0
  border_top: 2
  border_bottom: 2
}

// 左右の罫線を太くして強調
panel vertical_emphasis {
  border_left: 3
  border_right: 3
  border_top: 0
  border_bottom: 0
}

// 完全に罫線なし
panel borderless {
  border_top: 0
  border_bottom: 0
  border_left: 0
  border_right: 0
}
```

**個別罫線制御の優先順位:**
- `border_top`, `border_bottom`, `border_left`, `border_right`が指定されている場合、その値を使用
- 指定がない場合（`None`）、`border`の値を使用
- `0`を指定すると、その辺の罫線が非表示になる

**使用例:**
- 上下のコマを繋げて一体感を出す
- 左右のコマを繋げて連続感を演出
- 重要なコマを罫線で強調（太い罫線）
- 背景コマの罫線を省略（borderless）

---

### 3.4 balloon / monologue（吹き出し・独白）

セリフの吹き出しと、それ以外のテキスト要素（心の中の声、状況説明の地の文など）を配置できます。
これらは **`panel { ... }` の中に書きます**。コマは1つのシーンであり、そのシーンのセリフ・地の文は本質的にそのコマに属する情報だからです。

`monologue` は独白（内面の声）とナレーション（地の文）の両方を兼ねます。以前はこの2つを別要素として実装していましたが、両者の違いは「登場人物の目線で語られているか、そうでないか」という物語上の解釈（POV）の違いにすぎず、レイアウト上の構造としては同じ（矩形のテキストボックス）だったため統合しました。`background`/`text_color` の指定次第で、独白らしい見た目（背景なし）にもナレーションらしい見た目（黒地に白文字の帯など）にもできます。

#### 基本構文

```manga
page {
  row {
    panel char_a {
      background: "#dddddd"

      balloon {
        anchor_pos: top_right
        text: "おい、待てよ！"
        tail_angle: 225         // 度数、12時方向を0として時計回り。左下（char_bの方向）を指す
        shape: shout
      }
    }
    panel char_b {}
  }

  panel wide_scene {
    monologue {
      text: "そして、事件は起きた"
      background: "#000000"
      text_color: "#ffffff"
      x: 15
      y: 15
      width: 65
      height: 12
      z_index: 10             // コマ枠の上に重ねて描画
    }
  }
}
```

`balloon` / `monologue` はいずれも `panel` と同様、任意のID（省略可）と `{ ... }` 属性ブロックを取ります。`panel` の1行インライン記法（`panel small importance: 3`）の中には書けません（`{ ... }` ブロック形式が必要です）。

#### 共通属性

| 属性 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `text` | string | なし（必須） | 表示テキスト |
| `text_direction` | `horizontal` \| `vertical` | `horizontal` | 文字方向 |
| `font_size` | number (mm) | `4.5` | フォントサイズ |
| `padding` | number (mm) | `1.5` | 箱の縁とテキストの間の余白。`width`/`height`を省略した場合はテキスト量からの自動概算サイズにこの分が上乗せされる（テキスト用の実効スペースは変わらない）。`monologue`のように矩形いっぱいにテキストが詰まって窮屈に見える場合に大きくする |
| `x` | number (mm) | なし | 絶対配置（ページ座標系）: 左上X。X軸のみを上書きする——`x`だけ指定した場合、Y軸は引き続き`anchor_pos`に従う |
| `y` | number (mm) | なし | 絶対配置（ページ座標系）: 左上Y。Y軸のみを上書きする——`y`だけ指定した場合、X軸は引き続き`anchor_pos`に従う |
| `width` | number (mm) | テキスト量から自動概算 | 幅 |
| `height` | number (mm) | テキスト量から自動概算 | 高さ |
| `anchor_pos` | `top_left` \| `top_right` \| `bottom_left` \| `bottom_right` \| `center` \| `top` \| `bottom` \| `left` \| `right` | `top_right`（balloon）/ `top_right`（monologue） | **所属パネル**のどの角・辺を基準にするか |
| `margin` | number (mm) | `3` | `anchor_pos`で決まる成長方向に沿って、コマ枠から内側にどれだけ離すか。`0`にするとコマ枠にぴったり接する。`anchor_pos: center`など成長方向を持たない指定では効果なし |
| `dx`, `dy` | number (mm) | `0` | 基準位置からの微調整オフセット（`margin`適用後にさらにずらす） |
| `z_index` | int | なし（省略時100） | 重なり順。パネルの `z_index`/`importance` と同じスケールで比較される。省略時は常にコマ枠より前面 |
| `background` | color | 種別ごとに既定あり | 塗り色 |
| `border_color` | color | `"#000000"` | 輪郭線色 |
| `border` | number (mm) | 種別ごとに既定あり | 輪郭線太さ |
| `align` | `start` \| `center` \| `end` | `start` | テキストの行揃え |

**位置決め:** `anchor_pos` は、**自分が属している`panel`**のどの角・辺を基準点にするかを表します。要素の箱はその基準点から**パネルの内側方向へ**広がります（例えば `top_right` なら、要素の右上角が所属パネルの右上角に一致し、箱は左下方向、つまりパネル内部へ広がります）。`margin`（デフォルト3mm）はその成長方向に沿って基準点自体をコマ内側にずらすため、吹き出しがコマ枠にぴったりくっつかず、少し離れて配置されます。`x`と`y`はそれぞれ独立にページ絶対座標として上書きできます——`y: 200`だけ指定すれば、箱を下にずらしつつX軸は`anchor_pos`に従わせたままにできます（コマをまたぐ帯を敷きたい場合や、片方の軸だけ固定したい場合などで使う）。上書きした軸にも`margin`は引き続き効き、その軸方向で所属パネルの中心へ向けて寄せます。

**テキストのはみ出しについて:** `width`/`height` を省略した場合、文字数から簡易的に箱サイズを概算しますが、正確なレイアウト計算ではありません。テキストが箱に対して長すぎる場合、自動縮小はせず**はみ出したまま描画**します。想定と異なる場合は `width`/`height`/`font_size` を明示的に調整してください。

#### balloon（吹き出し）固有属性

| 属性 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `shape` | `oval` \| `shout` \| `whisper` \| `jagged` \| `explosion` \| `thought` \| `rounded_box` | `oval` | 輪郭の形状 |
| `aspect_ratio` | number | なし（テキスト量からの推定比率のまま） | 吹き出しの外接矩形の高さ÷幅の比率を上書きする。全shape共通。`width`/`height`をどちらも指定しない場合は面積を保ったまま縦横比だけ変更し、`width`か`height`のどちらか一方だけを指定した場合はその値を絶対値として固定し、もう一方を比率から計算する（§下記参照） |
| `corner_radius` | number (mm) | `3` | 角丸の半径。`shape: rounded_box` のときのみ有効 |
| `inner_ratio` | number (0-1) | なし（shape別デフォルト） | `shape: shout`/`jagged`/`explosion`の谷（内側頂点）の深さ。スパイク半径に対する比率で、小さいほど谷が深く鋭いスパイクになる。指定時も頂点ごとのランダムなゆらぎ（`jitter`参照）は維持されるため、手描き風の不規則さは失われない。省略時は各shapeの既定中心値（`shout`/`explosion`: 0.625、`jagged`: 0.765）を使用 |
| `jitter` | number | `1` | 手描き風の輪郭ゆらぎの強さ。既定のゆらぎ量に対する倍率で、`1`が元の量、`0`にすると完全に幾何学的な輪郭（ゆらぎなし）になり、`1`より大きくすると強調される。`oval`/`whisper`/`thought`の半径ゆらぎと、`shout`/`jagged`/`explosion`の谷の頂点ごとジッター幅の両方をスケールする（`inner_ratio`はジッターの中心をずらすだけで独立）。`rounded_box`はもともとゆらぎがないため効果なし |
| `tail_angle` | number (degrees) | `270` | しっぽが指す向き。時計方式（12時方向=`0`、時計回り）。`90`=右（3時）、`180`=下、`270`=左（9時、デフォルト。よくある`anchor_pos: top_right`配置で、パネル内部の内容へ向かって戻る向き） |
| `tail_length` | number (mm) | `5.6` | しっぽの長さ |
| `background` | color | `"#ffffff"` | 吹き出しの塗り色 |
| `border` | number (mm) | `0.45` | 輪郭線太さ。数値を大きくすると太く、小さくすると細くなる（例: `border: 0.2` で細め、`border: 1.0` で太め） |

**shape の種類:**

| `shape` | 用途 | 見た目 |
|---|---|---|
| `oval` | 通常のセリフ | 楕円 |
| `shout` | 叫び・強い感情 | ギザギザの星形、谷側も直線（振幅大） |
| `whisper` | 小声・弱い発言 | 破線境界の楕円 |
| `jagged` | 機械音声・電話越しなど | ギザギザの星形、谷側も直線（角が鋭い） |
| `explosion` | 衝撃・爆発の効果線 | `shout`と同じ星形シルエットだが、谷側が直線ではなく緩やかな曲線になる（漫画の爆発表現） |
| `thought` | 心の声（吹き出し形式） | 楕円＋泡状のしっぽ（円を連ねる） |
| `rounded_box` | ポップな見た目・SD調のセリフなど | 角丸の矩形（`corner_radius` で角の丸みを調整） |

`shape` の輪郭生成は固定パラメータの簡易実装です。頂点数や振幅の細かい調整はできません（将来拡張）。`aspect_ratio` は全shape共通で使え、例えば `shout` に指定すれば縦長の叫び吹き出しになります。

**`aspect_ratio` と `width`/`height` の組み合わせ:**

| 指定パターン | 挙動 |
|---|---|
| `aspect_ratio` のみ | テキスト量から概算したサイズの面積を保ったまま、高さ÷幅の比率だけ`aspect_ratio`に変更 |
| `width` + `aspect_ratio`（`height`省略） | 幅を`width`の値に絶対値で固定し、高さ = `width × aspect_ratio` を自動計算 |
| `height` + `aspect_ratio`（`width`省略） | 高さを`height`の値に絶対値で固定し、幅 = `height ÷ aspect_ratio` を自動計算 |
| `width` + `height` 両方 | `aspect_ratio`は無視され、指定した`width`/`height`をそのまま使用 |

```manga
balloon {
  shape: shout
  width: 20         // 幅を20mmに固定
  aspect_ratio: 2.0  // 高さ = 20 × 2.0 = 40mm
  text: "..."
}
```

```manga
panel hero_panel {
  balloon {
    anchor_pos: top_right
    text: "そこまでだ！"
    aspect_ratio: 1.8
    tail_angle: 200   // 真下よりやや左寄り
    shape: shout
  }
}
```

#### monologue（独白・ナレーション）固有属性

`monologue` は常に矩形です。`shape`（吹き出し形状）は持ちません。

| 属性 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `background` | color | `transparent` | 塗り色。独白らしくするなら`transparent`のまま、ナレーション帯にするなら`"#000000"`等を指定 |
| `text_color` | color | `"#000000"` | 文字色。黒地の帯にする場合は`"#ffffff"`等に変更する |
| `border` | number (mm) | `0` | デフォルトで枠線なし |

独白（内面の声）として使う場合:

```manga
panel hero_panel {
  monologue {
    anchor_pos: bottom_left
    text: "また同じ夢を見た"
  }
}
```

`monologue` は矩形いっぱいにテキストが広がるため、文字数が多いとテキストが詰まって見えることがあります。`padding` を大きくすると余白が広がります:

```manga
monologue {
  anchor_pos: top_right
  text: "厄介なことになったな"
  padding: 4
}
```

ナレーション（地の文）として使う場合。`x`/`y`/`width`/`height` の絶対配置と組み合わせれば**コマ枠の上に重ねて配置**できます（`z_index` を省略すれば常に前面）:

```manga
panel scene {
  monologue {
    text: "三日後——"
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

## 4. コメント

### 単一行コメント

```manga
// これは単一行コメントです
panel hero  // 行末コメントも可能
```

### 複数行コメント

```manga
/*
  これは
  複数行コメント
  です
*/
```

---

## 5. データ型

### 識別子

- パターン: `[a-zA-Z_][a-zA-Z0-9_]*`
- 例: `hero`, `panel_1`, `_temp`

### 数値

- 整数: `40`, `100`
- 小数: `40.5`, `3.14`
- 負数: `-10`, `-5.5`

### 単位付き数値

- mm: `40mm`, `100mm`
- px: `800px`
- pt: `72pt`
- パーセント: `40%`, `50.5%`

### 文字列

- ダブルクォートで囲む: `"hello"`
- エスケープシーケンス:
  - `\"` - ダブルクォート
  - `\\` - バックスラッシュ
  - `\n` - 改行

### 色

- 16進数カラーコード: `"#ff0000"`, `"#rgb"`, `"#rrggbb"`
- 名前付き色: `"red"`, `"blue"`（実装依存）

---

## 6. 使用例

### 例1: シンプルな1パネル

```manga
page {
  panel hero
}
```

### 例2: 2段組

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

### 例3: 4コマ漫画

```manga
page yonkoma {
  size: B5
  direction: rtl
  gutter: 6
  padding: 15

  row height: 25% {
    panel panel1 {
      image: "scenes/scene1.png"
      text: "起"
    }
  }
  row height: 25% {
    panel panel2 {
      image: "scenes/scene2.png"
      text: "承"
    }
  }
  row height: 25% {
    panel panel3 {
      image: "scenes/scene3.png"
      text: "転"
    }
  }
  row {
    panel panel4 {
      image: "scenes/scene4.png"
      text: "結"
      importance: 1
    }
  }
}
```

### 例4: 2×2 グリッド

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

### 例5: 不規則レイアウト

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

### 例6: 複雑なネスト

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

### 例7: 画像を使った実践例

```manga
page story {
  size: B5
  gutter: 5

  // 背景画像で雰囲気を出す
  row height: 40% {
    panel establishing_shot {
      image: "backgrounds/city.jpg"
      image_fit: cover
      importance: 1
    }
  }

  // キャラクター中心のコマ
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

  // リアクションコマ
  row {
    panel reaction {
      image: "effects/surprise.png"
      image_fit: cover
    }
  }
}
```

### 例8: 躍動感のあるレイアウト（skew使用）

```manga
page action {
  gutter: 6

  // 上段: 左右の辺を傾けて平行四辺形に
  row height: 40% {
    panel impact {
      importance: 1
      skew_left: 8
      skew_right: 8
    }
  }

  // 中段: 各コマを逆方向に傾ける
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

  // 下段: 通常配置
  row {
    panel aftermath
  }
}
```

### 例9: col/row への skew 指定（段組の斜め境界）

列全体の境界を傾けることで、列内の複数パネルに一括してskewを適用できます。

```manga
page {
  gutter: 6
  border: 1

  row {
    col {
      skew_right: -6    // 左列の右境界を傾ける
      panel left1 {}
    }
    col {
      row { panel right1 {} }
      row { panel right2 {} }
    }
  }
}
```

このとき、左列と右列の間のガターは傾いた2本の平行線で表現されます。右列内の `right1` と `right2` のコマ間は通常の水平ガターとして描画されます。

### 例10: 回想シーン（黒ガター）

`gutter_color` を暗い色にすると、コマ間のガターとページ外周のマージンが全て同色で塗られます。漫画の回想シーンや夢のシーンで使われる定番表現です。

```manga
page {
  gutter: 6
  padding: 10
  border: 1
  gutter_color: black   // コマ外のエリアを全て黒にする

  row { panel scene1 {} }
  row { panel scene2 {} }
  row { panel scene3 {} }
}
```

- `gutter_color` には色名（`black`, `gray`, `white`）も16進数（`"#000000"`）も使用可能
- デフォルトは `"#ffffff"`（白）で、通常の漫画ページと同じ見た目
- パネルの背景色（`background`）は独立して設定できる — 個別パネルに `background: "#e0e0e0"` を指定することで回想シーンらしいグレー調にできる

---

## 7. ベストプラクティス

### 命名規則

- パネルIDは内容を表す名前を使う: `hero`, `villain`, `background`
- ページ名は用途を表す: `main_layout`, `title_page`

### レイアウト設計

1. まず大枠を `row` で縦分割
2. 必要に応じて `col` で横分割
3. サイズ指定は重要度の高いパネルから順に
4. `%` 指定を多用しすぎない（auto を活用）
5. **躍動感の演出**: アクションシーンでは `skew` を使用してコマを傾ける（推奨: -10度〜+10度）

### 画像の使い方

1. **ディレクトリ構成**: 画像は専用フォルダにまとめる（例: `images/`, `assets/`）
2. **image_fitの選択**:
   - 背景・風景 → `cover`（画面を埋め尽くす）
   - キャラクター・オブジェクト → `contain`（全体を見せる）
   - テクスチャ・パターン → `fill`（引き伸ばす）
3. **ファイルサイズ**: 大きすぎる画像は避ける（推奨: 2MB以下）
4. **形式**: PNG（透過対応）、JPEG（写真）、SVG（ベクター）を使い分ける

### 可読性

- 適切なインデントを使用（2スペースまたは4スペース）
- セクションごとにコメントを追加
- 長いファイルは空行で区切る

---

## 8. よくあるエラー

### 構文エラー

```
Parse error: Unexpected token at line 10, column 5
Expected one of: row, col, panel
```

→ 構文が間違っています。波括弧やコロンの位置を確認してください。

### 比率超過エラー

```
Layout error: Percentage total (110%) exceeds 100%
```

→ 同じ階層内の `%` 指定の合計が100%を超えています。

### パネルID重複エラー

```
Validation error: Duplicate panel ID 'hero'
```

→ 同じIDのパネルが複数定義されています。一意なIDを使用してください。

### 画像ファイルエラー

```
Warning: Image file not found: 'assets/hero.png'
```

→ 指定された画像ファイルが見つかりません。パスが正しいか確認してください。

```
Error: Unsupported image format: 'image.bmp'
```

→ サポートされていない画像形式です。PNG、JPEG、GIF、SVGを使用してください。

---

**MangaDSL Language Reference v1.0**
最終更新: 2026-06-20
