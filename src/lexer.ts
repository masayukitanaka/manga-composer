/**
 * Hand-written tokenizer for the .manga DSL.
 *
 * Replaces the terminal definitions in manga-gen-python/src/manga_gen/grammar.lark.
 *
 * Terminal reference (grammar.lark), highest priority first:
 *   SIZE_VALUE.3 : /\d+(\.\d+)?x\d+(\.\d+)?(mm|px|pt)?/   e.g. 420x297, 800x600px
 *   PERCENTAGE.2 : /\d+(\.\d+)?%/                          e.g. 40%, 50.5%
 *   STRING.2     : /"([^"\\]|\\.)*"/
 *   NUMBER       : minus-optional digits with optional decimal
 *   UNIT         : "mm" | "px" | "pt"
 *   CNAME        : identifier, [a-zA-Z_] then [a-zA-Z0-9_]
 *   %ignore whitespace, line comments, and block comments
 *
 * NOTE (docs/PORTING_NOTES.md): we do NOT reproduce Lark's keyword-promotion
 * terminals (WIDTH_KW/HEIGHT_KW/ALIGN_KW/GUTTER_KW). width, height, align,
 * gutter, the margin_ and skew_ families, and panel/row/col/page/balloon/
 * monologue are all lexed uniformly as IDENT; the parser decides meaning from
 * grammatical position.
 *
 * UNIT is not emitted as its own token kind here — a trailing mm/px/pt after a
 * NUMBER is just an IDENT, and the parser's length-value rule consumes an
 * optional IDENT unit after a NUMBER (matching grammar `value: NUMBER UNIT?`).
 * SIZE_VALUE and PERCENTAGE bake their unit/sign into a single token because
 * the grammar treats them as atomic terminals.
 */

import { ParseError } from "./errors.js";

export type TokenType =
  | "IDENT" // CNAME (includes keywords and bare unit words like mm/px/pt)
  | "NUMBER" // -?\d+(\.\d+)?
  | "PERCENTAGE" // \d+(\.\d+)?%
  | "STRING" // "..."
  | "SIZE_VALUE" // WxH[unit]
  | "LBRACE" // {
  | "RBRACE" // }
  | "COLON" // :
  | "COMMA" // ,
  | "EOF";

export interface Token {
  type: TokenType;
  /** Raw source text of the token (STRING keeps its surrounding quotes). */
  value: string;
  line: number; // 1-based
  col: number; // 1-based
}

const RE_SIZE_VALUE = /^\d+(\.\d+)?x\d+(\.\d+)?(mm|px|pt)?/;
const RE_PERCENTAGE = /^\d+(\.\d+)?%/;
const RE_NUMBER = /^-?\d+(\.\d+)?/;
const RE_STRING = /^"([^"\\]|\\.)*"/;
const RE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = source.length;

  const advance = (count: number): void => {
    for (let k = 0; k < count; k++) {
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < n) {
    const ch = source[i];

    // ── whitespace ──────────────────────────────────────────────────────
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance(1);
      continue;
    }

    // ── comments ────────────────────────────────────────────────────────
    if (ch === "/" && source[i + 1] === "/") {
      // line comment: consume to end of line (newline handled next loop)
      let j = i + 2;
      while (j < n && source[j] !== "\n") j++;
      advance(j - i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      // block comment: consume through the closing */
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j++;
      if (j >= n) {
        throw new ParseError(`Unterminated block comment at line ${line}, column ${col}`);
      }
      advance(j + 2 - i); // include the closing */
      continue;
    }

    const startLine = line;
    const startCol = col;
    const rest = source.slice(i);

    // ── single-char structural tokens ───────────────────────────────────
    if (ch === "{") {
      tokens.push({ type: "LBRACE", value: "{", line: startLine, col: startCol });
      advance(1);
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "RBRACE", value: "}", line: startLine, col: startCol });
      advance(1);
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "COLON", value: ":", line: startLine, col: startCol });
      advance(1);
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA", value: ",", line: startLine, col: startCol });
      advance(1);
      continue;
    }

    // ── string literal ──────────────────────────────────────────────────
    if (ch === '"') {
      const m = RE_STRING.exec(rest);
      if (!m) {
        throw new ParseError(`Unterminated string at line ${startLine}, column ${startCol}`);
      }
      tokens.push({ type: "STRING", value: m[0], line: startLine, col: startCol });
      advance(m[0].length);
      continue;
    }

    // ── numeric-leading tokens ──────────────────────────────────────────
    // Order matters: SIZE_VALUE (has an 'x' infix) before PERCENTAGE before
    // NUMBER, mirroring the grammar's terminal priority. A leading '-' can
    // only be a NUMBER (SIZE_VALUE/PERCENTAGE are unsigned in the grammar).
    if ((ch >= "0" && ch <= "9") || ch === "-" || ch === ".") {
      const mSize = ch >= "0" && ch <= "9" ? RE_SIZE_VALUE.exec(rest) : null;
      if (mSize) {
        tokens.push({ type: "SIZE_VALUE", value: mSize[0], line: startLine, col: startCol });
        advance(mSize[0].length);
        continue;
      }
      const mPct = ch >= "0" && ch <= "9" ? RE_PERCENTAGE.exec(rest) : null;
      if (mPct) {
        tokens.push({ type: "PERCENTAGE", value: mPct[0], line: startLine, col: startCol });
        advance(mPct[0].length);
        continue;
      }
      const mNum = RE_NUMBER.exec(rest);
      if (mNum) {
        tokens.push({ type: "NUMBER", value: mNum[0], line: startLine, col: startCol });
        advance(mNum[0].length);
        continue;
      }
      // A lone '-' or '.' with no digits is a syntax error.
      throw new ParseError(
        `Unexpected character '${ch}' at line ${startLine}, column ${startCol}`,
      );
    }

    // ── identifier / keyword ────────────────────────────────────────────
    const mId = RE_IDENT.exec(rest);
    if (mId) {
      tokens.push({ type: "IDENT", value: mId[0], line: startLine, col: startCol });
      advance(mId[0].length);
      continue;
    }

    // ── anything else ───────────────────────────────────────────────────
    throw new ParseError(
      `Unexpected character '${ch}' at line ${startLine}, column ${startCol}`,
    );
  }

  tokens.push({ type: "EOF", value: "", line, col });
  return tokens;
}
