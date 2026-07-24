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
import { ParseError } from "../errors.js";
/**
 * Split marked-up `text` into runs of constant decoration. `base` supplies the
 * element-wide defaults (from font_style / font_weight); a tag ORs its bit on
 * top, so `<b>` inside an already-italic element yields italic+bold.
 *
 * Throws ParseError on an unclosed tag, a stray/mismatched close tag, or
 * crossed nesting (`<b><i></b></i>`).
 */
export function parseRichText(text, base) {
    const runs = [];
    const stack = []; // open tags, innermost last
    let buf = "";
    const flush = () => {
        if (buf === "")
            return;
        runs.push({
            text: buf,
            italic: base.italic || stack.includes("i"),
            bold: base.bold || stack.includes("b"),
        });
        buf = "";
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\" && text[i + 1] === "<") {
            // Escaped literal '<'.
            buf += "<";
            i++;
            continue;
        }
        if (ch === "<") {
            const m = /^<(\/?)([a-zA-Z]+)>/.exec(text.slice(i));
            if (!m) {
                throw new ParseError(`Invalid inline tag in text near "${text.slice(i, i + 8)}" (use \\< for a literal '<')`);
            }
            const closing = m[1] === "/";
            const name = m[2].toLowerCase();
            if (name !== "i" && name !== "b") {
                throw new ParseError(`Unknown inline tag <${m[1]}${m[2]}> (only <i> and <b> are supported)`);
            }
            const tag = name;
            flush();
            if (!closing) {
                stack.push(tag);
            }
            else {
                const top = stack[stack.length - 1];
                if (top !== tag) {
                    throw new ParseError(top === undefined
                        ? `Unexpected closing tag </${tag}> with no matching <${tag}>`
                        : `Mismatched inline tags: </${tag}> closes while <${top}> is still open`);
                }
                stack.pop();
            }
            i += m[0].length - 1; // skip the whole tag (loop will i++)
            continue;
        }
        buf += ch;
    }
    flush();
    if (stack.length > 0) {
        throw new ParseError(`Unclosed inline tag <${stack[stack.length - 1]}> in text`);
    }
    return runs;
}
/**
 * The text with all inline markup removed (and `\<` reduced to `<`). Used for
 * wrapping and box-size estimation, so tags never inflate the character count.
 * Validates the markup too (throws on malformed tags), so calling it early
 * surfaces tag errors even for text that is never split into runs.
 */
export function plainText(text) {
    return parseRichText(text, { italic: false, bold: false })
        .map((r) => r.text)
        .join("");
}
//# sourceMappingURL=richtext.js.map