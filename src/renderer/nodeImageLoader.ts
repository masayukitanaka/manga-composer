/**
 * Node/filesystem-backed ImageLoader.
 *
 * This is the ONLY renderer module that touches `node:fs`/`node:path`, so it
 * must never be imported from the browser entry point. The CLI and the main
 * library entry (index.ts) wire this in as the default loader, preserving the
 * original filesystem behaviour of SVGRenderer._render_image.
 */

import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import type { ImageLoader, LoadedImage } from "./imageLoader.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/**
 * Build an ImageLoader that resolves paths relative to `sourceDir` from disk.
 * Mirrors the pre-refactor inline logic in svg.ts (`readFileSync(join(...))`).
 */
export function createNodeImageLoader(sourceDir: string): ImageLoader {
  return (imagePath: string): LoadedImage | null => {
    const fullPath = join(sourceDir, imagePath);
    if (!existsSync(fullPath)) return null;
    const bytes = readFileSync(fullPath);
    const ext = extname(fullPath).toLowerCase();
    return {
      dataBase64: bytes.toString("base64"),
      mime: MIME_TYPES[ext] ?? "image/png",
    };
  };
}
