/**
 * Minimal XML element builder, replacing Python's xml.etree.ElementTree usage
 * in renderer/svg.py. We build a small mutable tree and serialize it, so the
 * renderer code can mirror the Python `ET.SubElement(parent, tag, attrs)`
 * structure closely (attribute insertion order is preserved, matching
 * ElementTree, which the SVG-diff harness relies on for element order).
 */
export declare class XmlElement {
    readonly tag: string;
    readonly attrs: Map<string, string>;
    readonly childrenNodes: (XmlElement | {
        text: string;
    })[];
    private textContent;
    constructor(tag: string, attrs?: Record<string, string | number>);
    set(key: string, value: string | number): void;
    /** Set the element's text content (like ElementTree's `elem.text = ...`). */
    setText(text: string): void;
    /** Append and return a new child element (like ET.SubElement). */
    sub(tag: string, attrs?: Record<string, string | number>): XmlElement;
    serialize(): string;
}
//# sourceMappingURL=xml.d.ts.map