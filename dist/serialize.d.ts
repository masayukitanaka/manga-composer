/**
 * AST → .manga source serializer (the inverse of parse()).
 *
 * `parse()` normalizes everything and materializes defaults, so a faithful
 * "write back exactly what the user typed" is impossible (docs/SPEC.md §3). This
 * serializer instead emits a canonical .manga document that RE-PARSES to an
 * equivalent AST: only attributes that differ from their defaults are written,
 * using the DSL's snake_case attribute names.
 *
 * Round-trip guarantee (covered by test/unit/serialize.test.ts):
 *   parse(serialize(parse(src)))  deep-equals  parse(src)
 *
 * Note on page border/border_color: parse() folds the page-level `border` /
 * `border_color` into every panel as its default. To keep the round-trip exact
 * we compare each panel's border against the PAGE's resolved border (not the
 * hard-coded panel default), so a panel that merely inherited the page value is
 * not re-emitted as an explicit attribute.
 */
import { type Page } from "./ast.js";
/** Serialize a parsed Page back to canonical .manga source text. */
export declare function serialize(page: Page): string;
//# sourceMappingURL=serialize.d.ts.map