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
export type TokenType = "IDENT" | "NUMBER" | "PERCENTAGE" | "STRING" | "SIZE_VALUE" | "LBRACE" | "RBRACE" | "COLON" | "COMMA" | "EOF";
export interface Token {
    type: TokenType;
    /** Raw source text of the token (STRING keeps its surrounding quotes). */
    value: string;
    line: number;
    col: number;
}
export declare function tokenize(source: string): Token[];
//# sourceMappingURL=lexer.d.ts.map