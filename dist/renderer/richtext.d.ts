/**
 * Inline rich-text markup for speech/monologue text.
 *
 * A tiny, deliberately non-HTML subset: `<i>…</i>` (italic) and `<b>…</b>`
 * (bold), case-insensitive, nestable. A literal `<` is written `\<`. Tags carry
 * no width (they don't affect wrapping or box-size estimation) — `plainText`
 * returns the text with all markup removed.
 *
 * See .private/FONT.md §2.4.
 */
export interface TextRun {
    text: string;
    italic: boolean;
    bold: boolean;
}
/**
 * Split marked-up `text` into runs of constant decoration. `base` supplies the
 * element-wide defaults (from font_style / font_weight); a tag ORs its bit on
 * top, so `<b>` inside an already-italic element yields italic+bold.
 *
 * Throws ParseError on an unclosed tag, a stray/mismatched close tag, or
 * crossed nesting (`<b><i></b></i>`).
 */
export declare function parseRichText(text: string, base: {
    italic: boolean;
    bold: boolean;
}): TextRun[];
/**
 * The text with all inline markup removed (and `\<` reduced to `<`). Used for
 * wrapping and box-size estimation, so tags never inflate the character count.
 * Validates the markup too (throws on malformed tags), so calling it early
 * surfaces tag errors even for text that is never split into runs.
 */
export declare function plainText(text: string): string;
//# sourceMappingURL=richtext.d.ts.map