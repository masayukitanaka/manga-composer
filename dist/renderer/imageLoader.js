/**
 * Image loading abstraction (dependency-injection point for SVGRenderer).
 *
 * The renderer itself is pure — it never touches the filesystem. Instead it
 * asks an `ImageLoader` to resolve a panel's `image:` path into base64 data.
 * This keeps the SVG pipeline runnable in the browser: the Node CLI injects a
 * `fs`-backed loader (nodeImageLoader.ts), while a browser host can inject one
 * backed by uploaded blobs / data URIs.
 *
 * Returning `null` means "unresolved" — the renderer draws a placeholder box.
 */
export {};
//# sourceMappingURL=imageLoader.js.map