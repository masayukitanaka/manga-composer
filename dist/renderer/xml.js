/**
 * Minimal XML element builder, replacing Python's xml.etree.ElementTree usage
 * in renderer/svg.py. We build a small mutable tree and serialize it, so the
 * renderer code can mirror the Python `ET.SubElement(parent, tag, attrs)`
 * structure closely (attribute insertion order is preserved, matching
 * ElementTree, which the SVG-diff harness relies on for element order).
 */
export class XmlElement {
    tag;
    attrs;
    childrenNodes = [];
    textContent = null;
    constructor(tag, attrs = {}) {
        this.tag = tag;
        this.attrs = new Map();
        for (const [k, v] of Object.entries(attrs)) {
            this.attrs.set(k, String(v));
        }
    }
    set(key, value) {
        this.attrs.set(key, String(value));
    }
    /** Set the element's text content (like ElementTree's `elem.text = ...`). */
    setText(text) {
        this.textContent = text;
    }
    /** Append and return a new child element (like ET.SubElement). */
    sub(tag, attrs = {}) {
        const el = new XmlElement(tag, attrs);
        this.childrenNodes.push(el);
        return el;
    }
    serialize() {
        const attrStr = [...this.attrs.entries()]
            .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
            .join("");
        const hasChildren = this.childrenNodes.length > 0;
        const hasText = this.textContent !== null && this.textContent !== "";
        if (!hasChildren && !hasText) {
            return `<${this.tag}${attrStr} />`;
        }
        let inner = "";
        if (hasText)
            inner += escapeText(this.textContent);
        for (const c of this.childrenNodes) {
            inner += c instanceof XmlElement ? c.serialize() : escapeText(c.text);
        }
        return `<${this.tag}${attrStr}>${inner}</${this.tag}>`;
    }
}
function escapeAttr(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function escapeText(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
//# sourceMappingURL=xml.js.map