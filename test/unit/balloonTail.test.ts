/**
 * rounded_box 吹き出しのしっぽと輪郭のテスト。
 *
 * rounded_box は他の形状（oval / star 系）と違い、輪郭が「角丸の円弧＋直線」で
 * 構成される。しっぽは中心からのレイと矩形の交点に取り付ける（他形状の
 * edge+位置(%) 方式は、扇形を辺に線形で割り当てるため長方形では中心の
 * 4 方向しか合わない）。向きと輪郭の連続性を固定する。
 */

import { describe, expect, it } from "vitest";
import { compileToSvg } from "../../src/index.js";
import { parse } from "../../src/parser.js";
import { LayoutEngine } from "../../src/layout/slicing.js";
import { resolveBalloonTail } from "../../src/renderer/balloonOutline.js";

interface BalloonOpts {
  tailAngle: number;
  cornerRadius?: number;
  width?: number;
  height?: number;
}

function balloonDsl(opts: BalloonOpts): string {
  return `
page {
  size: B5
  panel p1 {
    balloon {
      text: "テスト"
      shape: rounded_box
      corner_radius: ${opts.cornerRadius ?? 3}
      tail_angle: ${opts.tailAngle}
      tail_length: 8
      width: ${opts.width ?? 40}
      height: ${opts.height ?? 25}
    }
  }
}
`.trim();
}

/** rounded_box のふきだし 1 つを含むページをレンダリングする。 */
function renderBalloon(opts: BalloonOpts): string {
  return compileToSvg(balloonDsl(opts), ".");
}

/**
 * しっぽが実際に向いている方向（tail_angle と同じ「12時から時計回りの度数」）。
 *
 * レンダラと同じ resolveBalloonTail を使うので、描画結果と食い違わない。
 */
function tailDirectionDeg(opts: BalloonOpts): number {
  const page = parse(balloonDsl(opts));
  const engine = new LayoutEngine(page);
  engine.layout();
  const speech = engine.speeches[0];
  const tail = resolveBalloonTail(speech);
  if (!tail) throw new Error("しっぽが解決できない");
  const cx = speech.rect.x + speech.rect.w / 2;
  const cy = speech.rect.y + speech.rect.h / 2;
  const deg = (Math.atan2(tail.tipY - cy, tail.tipX - cx) * 180) / Math.PI;
  // atan2 は 3 時が 0・反時計回り。tail_angle は 12 時が 0・時計回り。
  return (deg + 90 + 360) % 360;
}

/** ふきだし本体の <path> の d 属性を取り出す。 */
function balloonPathD(svg: string): string {
  // テキストではなく、塗り+線のある閉パスがふきだし本体。
  const matches = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)];
  if (matches.length === 0) throw new Error("balloon path not found");
  // 一番長い d をふきだし輪郭とみなす（テキスト装飾より複雑なため）。
  return matches.map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
}

/** パス中の全座標点。 */
function pathPoints(d: string): [number, number][] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
}

describe("rounded_box のしっぽ", () => {
  // 本体サイズは DSL で 40x25mm 固定。しっぽは本体の外へ出るので、
  // 「本体からのはみ出し量」を測れば向きと長さが分かる。
  const BODY_W = 40;
  const BODY_H = 25;
  const TAIL_LEN = 8;

  type Box = { minX: number; maxX: number; minY: number; maxY: number };
  const bbox = (pts: [number, number][]): Box => ({
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  });

  /** 上下左右それぞれへのはみ出し量（mm）。 */
  function protrusion(opts: { tailAngle: number; cornerRadius?: number }) {
    const box = bbox(pathPoints(renderBalloon(opts)));
    return {
      horizontal: box.maxX - box.minX - BODY_W,
      vertical: box.maxY - box.minY - BODY_H,
    };
  }

  // tail_angle は「12時から時計回りの度数」。0=上, 90=右, 180=下, 270=左。
  const CASES = [
    { angle: 0, edge: "上", axis: "vertical" as const },
    { angle: 90, edge: "右", axis: "horizontal" as const },
    { angle: 180, edge: "下", axis: "vertical" as const },
    { angle: 270, edge: "左", axis: "horizontal" as const },
  ];

  for (const c of CASES) {
    it(`tail_angle=${c.angle} でしっぽが${c.edge}方向に tail_length ぶん出る`, () => {
      const p = protrusion({ tailAngle: c.angle });
      const other = c.axis === "vertical" ? p.horizontal : p.vertical;

      // しっぽ方向にはほぼ tail_length ぶん伸びる。
      expect(p[c.axis]).toBeGreaterThan(TAIL_LEN * 0.9);
      // 直交方向には（根元の幅ぶんを除き）伸びない。
      // 修正前はここが 12mm 以上あり、しっぽが横倒しになっていた。
      expect(other).toBeLessThan(1);
    });
  }

  /**
   * 上下左右の 4 方向（0/90/180/270）だけを見ても不十分。
   *
   * しっぽの取り付け位置は以前「90°の扇形を辺に線形で割り当てる」方式で、
   * ちょうどこの 4 方向＝扇形の中心だけは正しく、その間がずれていた。
   * さらに下辺・左辺では % の向きが回転方向と逆で、tail_angle=220（左下）が
   * 右下に出ていた。全周をきざんで確認する。
   */
  it("全周どの角度でも、しっぽが指定方向を向く", () => {
    const errors: string[] = [];
    for (let angle = 0; angle < 360; angle += 5) {
      const actual = tailDirectionDeg({ tailAngle: angle });
      const diff = Math.abs(((actual - angle + 540) % 360) - 180);
      if (diff > 1) errors.push(`angle=${angle} → 実際 ${actual.toFixed(1)}（ずれ ${diff.toFixed(1)}°）`);
    }
    expect(errors).toEqual([]);
  });

  it("縦長・横長・角丸の大小を変えても全周で向きが保たれる", () => {
    const errors: string[] = [];
    for (const [w, h] of [
      [40, 25],
      [25, 40],
      [30, 30],
    ]) {
      for (const cornerRadius of [0, 3, 12]) {
        for (let angle = 0; angle < 360; angle += 15) {
          const actual = tailDirectionDeg({ tailAngle: angle, cornerRadius, width: w, height: h });
          const diff = Math.abs(((actual - angle + 540) % 360) - 180);
          if (diff > 1) errors.push(`${w}x${h} r=${cornerRadius} angle=${angle} ずれ ${diff.toFixed(1)}°`);
        }
      }
    }
    expect(errors).toEqual([]);
  });

  it("角丸の大きさを変えてもしっぽの向き・長さは変わらない", () => {
    for (const cornerRadius of [0.5, 3, 6, 8, 12]) {
      const p = protrusion({ tailAngle: 90, cornerRadius });
      expect(p.horizontal).toBeGreaterThan(TAIL_LEN * 0.9);
      expect(p.vertical).toBeLessThan(1);
    }
  });

  it("しっぽが潰れない（根元が一点に縮退しない）", () => {
    // 根元が縮退すると、しっぽは線一本になり面積を持たなくなる。
    // 上向きのしっぽなので、本体の上辺より上にある点が根元の左右と先端。
    const pts = pathPoints(renderBalloon({ tailAngle: 0, cornerRadius: 6 }));
    const box = bbox(pts);
    // しっぽは上向き。先端は bbox 上端、根元は本体の上辺（bbox上端+tail_length）。
    const tipY = box.minY;
    const baseY = box.minY + TAIL_LEN;

    const tip = pts.filter((p) => Math.abs(p[1] - tipY) < 0.01);
    expect(tip.length).toBeGreaterThan(0);

    // 根元は先端の左右に開いている必要がある（縮退していれば同一点になる）。
    const base = pts.filter((p) => Math.abs(p[1] - baseY) < 0.01);
    const nearTip = base.filter((p) => Math.abs(p[0] - tip[0][0]) < 5);
    expect(nearTip.length).toBeGreaterThanOrEqual(2);
    const width = Math.max(...nearTip.map((p) => p[0])) - Math.min(...nearTip.map((p) => p[0]));
    expect(width).toBeGreaterThan(0.5);
  });
});

describe("rounded_box の輪郭", () => {
  it("角丸と直線の接続部でギザギザにならない", () => {
    // 角丸の円弧は複数の点で近似され、直線部は端点のみ。全点を等しく
    // Catmull-Rom で通すと、円弧→直線の変わり目で制御点が暴れて
    // 「ふくらみ」や「へこみ」が出る。
    //
    // 検出方法: 輪郭を細かくサンプリングし、本来まっすぐな上辺の範囲で
    // y 座標がどれだけ揺れるかを見る。
    // しっぽは左に出しておき、上辺を「しっぽの無いまっすぐな辺」として測る。
    const d = renderBalloon({ tailAngle: 270, cornerRadius: 6 });
    const pts = pathPoints(d);
    const minY = Math.min(...pts.map((p) => p[1]));

    // 上辺の高さ（y=minY）にある点は、直線部の両端だけのはず。
    // スプラインを通していた頃はここが膨らみ、y が minY からずれた点が
    // 直線上に並んでいた（＝角丸との接続部でギザギザに見える原因）。
    const onTopLine = pts.filter((p) => Math.abs(p[1] - minY) < 1e-6);
    expect(onTopLine.length).toBeGreaterThanOrEqual(2);

    // 直線部の範囲内に、上辺から浮いた点が無いこと。
    const xs = onTopLine.map((p) => p[0]);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const strayed = pts.filter(
      (p) => p[0] > left + 0.01 && p[0] < right - 0.01 && Math.abs(p[1] - minY) > 0.01,
    );
    expect(strayed).toEqual([]);
  });

  it("角丸が大きくても輪郭がなめらか（点が十分に細かい）", () => {
    // 円弧をポリラインで描くので、点が粗いとカクカクに見える。
    // しっぽを付けない状態の輪郭で、円弧部の刻み幅を見る。
    // （しっぽの根元は half=2.1mm 幅で開くので、混ぜると測れない）
    const pts = pathPoints(renderBalloon({ tailAngle: 90, cornerRadius: 12 }));
    const steps: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      // 直線の辺（長い）としっぽの根元（1.5mm 超）を除いた残りが円弧の刻み。
      if (len < 1.5) steps.push(len);
    }
    expect(steps.length).toBeGreaterThan(10);
    // 1mm 程度に収まっていれば、印刷サイズでカクつきは見えない。
    expect(Math.max(...steps)).toBeLessThan(1.1);
  });
});
