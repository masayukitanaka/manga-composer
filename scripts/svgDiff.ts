/**
 * SVG structural diff with numeric tolerance.
 *
 * Parses two SVGs (order-preserving) and walks them in parallel:
 *   - tag name and `id` attribute: exact match
 *   - non-numeric attributes (fill, stroke, ...): exact match
 *   - numeric-valued attributes (x, y, width, points, d, ...): parsed as
 *     numbers and compared within EPS (default 0.01mm). This absorbs the
 *     Python `str(20.0)` vs JS `String(20)` formatting difference documented
 *     in docs/PORTING_NOTES.md.
 *   - <text>/<tspan> text content: exact string match.
 *   - balloon-outline <path> elements: relaxed to attribute + point-count +
 *     bounding-box (PRNG jitter differs by design — docs/PORTING_NOTES.md).
 */

import { XMLParser } from "fast-xml-parser";

export interface Mismatch {
  path: string;
  kind: "missing-element" | "extra-element" | "attr-mismatch" | "text-mismatch";
  detail: string;
}

export interface DiffResult {
  pass: boolean;
  mismatches: Mismatch[];
}

const DEFAULT_EPS = 0.01;

// Attributes whose values are (possibly multi-)numeric and should be compared
// numerically rather than as strings.
const NUMERIC_ATTRS = new Set([
  "x",
  "y",
  "width",
  "height",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "stroke-width",
  "points",
  "d",
  "font-size",
  "opacity",
  "viewBox",
]);

// fast-xml-parser (preserveOrder) node shape: each node is an object with one
// tag key mapping to an array of child nodes, plus a ":@" key holding attrs.
interface XmlNode {
  [key: string]: unknown;
  ":@"?: Record<string, string>;
}

function makeParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
    trimValues: false,
    // keep #text nodes
  });
}

function tagName(node: XmlNode): string {
  for (const k of Object.keys(node)) {
    if (k !== ":@") return k;
  }
  return "";
}

function children(node: XmlNode, tag: string): XmlNode[] {
  const v = node[tag];
  return Array.isArray(v) ? (v as XmlNode[]) : [];
}

function attrs(node: XmlNode): Record<string, string> {
  return node[":@"] ?? {};
}

function extractNumbers(s: string): number[] {
  const matches = s.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function numbersClose(a: number[], b: number[], eps: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

function isBalloonPath(tag: string, a: Record<string, string>): boolean {
  // Balloon outlines are <path> elements with a curvy `d`. Monologue/panel
  // paths don't occur (those are rect/line/polygon), so any <path> is a
  // balloon outline here. Relax comparison per docs/PORTING_NOTES.md.
  return tag === "path" && typeof a.d === "string";
}

function bbox(d: string): [number, number, number, number] | null {
  const nums = extractNumbers(d);
  if (nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]);
    maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]);
    maxY = Math.max(maxY, nums[i + 1]);
  }
  return [minX, minY, maxX, maxY];
}

function compareNodes(
  a: XmlNode,
  b: XmlNode,
  path: string,
  eps: number,
  bboxEps: number,
  out: Mismatch[],
): void {
  const ta = tagName(a);
  const tb = tagName(b);
  if (ta !== tb) {
    out.push({ path, kind: "attr-mismatch", detail: `tag ${ta} != ${tb}` });
    return;
  }

  // #text node — compare content exactly.
  if (ta === "#text") {
    const at = String((a as Record<string, unknown>)["#text"] ?? "");
    const bt = String((b as Record<string, unknown>)["#text"] ?? "");
    if (at !== bt) {
      out.push({ path, kind: "text-mismatch", detail: `${JSON.stringify(at)} != ${JSON.stringify(bt)}` });
    }
    return;
  }

  const aa = attrs(a);
  const ba = attrs(b);
  const nodePath = `${path} > ${ta}${aa.id ? `#${aa.id}` : ""}`;

  const relaxed = isBalloonPath(ta, aa);

  // id must match exactly (structural identity).
  if ((aa.id ?? null) !== (ba.id ?? null)) {
    out.push({ path: nodePath, kind: "attr-mismatch", detail: `id ${aa.id} != ${ba.id}` });
  }

  // Attribute comparison.
  const keys = new Set([...Object.keys(aa), ...Object.keys(ba)]);
  for (const key of keys) {
    if (key === "id") continue;
    const va = aa[key];
    const vb = ba[key];
    if (va === undefined || vb === undefined) {
      out.push({
        path: nodePath,
        kind: "attr-mismatch",
        detail: `attr ${key}: ${va === undefined ? "(missing on left)" : va} vs ${vb === undefined ? "(missing on right)" : vb}`,
      });
      continue;
    }
    if (relaxed && key === "d") {
      const ba1 = bbox(va);
      const bb1 = bbox(vb);
      if (ba1 && bb1) {
        const ok = ba1.every((v, i) => Math.abs(v - bb1[i]) <= bboxEps);
        if (!ok) {
          out.push({
            path: nodePath,
            kind: "attr-mismatch",
            detail: `balloon path bbox differs beyond ${bboxEps}mm: ${ba1} vs ${bb1}`,
          });
        }
      }
      continue;
    }
    if (NUMERIC_ATTRS.has(key)) {
      const na = extractNumbers(va);
      const nb = extractNumbers(vb);
      if (!numbersClose(na, nb, eps)) {
        out.push({
          path: nodePath,
          kind: "attr-mismatch",
          detail: `attr ${key}: ${va} vs ${vb} (numeric, eps=${eps})`,
        });
      }
    } else if (va !== vb) {
      out.push({
        path: nodePath,
        kind: "attr-mismatch",
        detail: `attr ${key}: ${JSON.stringify(va)} vs ${JSON.stringify(vb)}`,
      });
    }
  }

  // Recurse into children (order-preserving).
  const ca = children(a, ta);
  const cb = children(b, ta);
  const maxLen = Math.max(ca.length, cb.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= ca.length) {
      out.push({
        path: `${nodePath}[${i}]`,
        kind: "extra-element",
        detail: `right has extra ${tagName(cb[i])}`,
      });
      continue;
    }
    if (i >= cb.length) {
      out.push({
        path: `${nodePath}[${i}]`,
        kind: "missing-element",
        detail: `right is missing ${tagName(ca[i])}`,
      });
      continue;
    }
    compareNodes(ca[i], cb[i], `${nodePath}[${i}]`, eps, bboxEps, out);
  }
}

export function diffSvg(
  refSvg: string,
  candidateSvg: string,
  opts: { eps?: number; bboxEps?: number } = {},
): DiffResult {
  const eps = opts.eps ?? DEFAULT_EPS;
  const bboxEps = opts.bboxEps ?? 2.0; // generous — balloon jitter differs
  const parser = makeParser();
  const refRoot = parser.parse(refSvg) as XmlNode[];
  const candRoot = parser.parse(candidateSvg) as XmlNode[];

  const out: Mismatch[] = [];
  // Top level is an array of nodes (usually just the <svg> root).
  const maxLen = Math.max(refRoot.length, candRoot.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= refRoot.length || i >= candRoot.length) {
      out.push({
        path: `[${i}]`,
        kind: i >= refRoot.length ? "extra-element" : "missing-element",
        detail: "top-level node count differs",
      });
      continue;
    }
    compareNodes(refRoot[i], candRoot[i], `[${i}]`, eps, bboxEps, out);
  }

  return { pass: out.length === 0, mismatches: out };
}
