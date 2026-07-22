/**
 * Recursive-descent parser: tokens -> Page AST.
 *
 * Port of manga-gen-python/src/manga_gen/parser.py + grammar.lark structural
 * rules. Function names mirror the grammar rules 1:1 for traceability.
 *
 * grammar.lark structure (reference):
 *   page: "page" CNAME? "{" page_body* "}"
 *   page_body: page_attr | statement
 *   statement: row_stmt | col_stmt | panel_stmt
 *   row_stmt: "row" row_attrs? "{" row_body* "}"
 *   col_stmt: "col" col_attrs? "{" col_body* "}"
 *   row_body: row_attr | statement           col_body: col_attr | statement
 *   panel_stmt: "panel" CNAME panel_def?
 *   panel_def: "{" panel_body* "}" | panel_inline_attrs
 *   panel_body: panel_attr | balloon_stmt | monologue_stmt
 *   panel_inline_attrs: panel_attr ("," panel_attr)*
 *   balloon_stmt: "balloon" CNAME? speech_def?
 *   monologue_stmt: "monologue" CNAME? speech_def?
 *   speech_def: "{" panel_attr* "}" | panel_inline_attrs
 *   row_attrs: row_attr ("," row_attr)*   (row_attr: height|gutter|align|margin|skew)
 *   value: NUMBER UNIT? | PERCENTAGE | STRING | CNAME
 *   length_value: NUMBER UNIT | PERCENTAGE
 */
import { type Page } from "./ast.js";
/**
 * Parse DSL source code and return the Page AST.
 * @throws ParseError on any syntax or validation error.
 */
export declare function parse(source: string): Page;
//# sourceMappingURL=parser.d.ts.map