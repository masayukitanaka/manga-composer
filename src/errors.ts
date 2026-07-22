/**
 * MangaDSL exception types.
 *
 * Port of manga-gen-python/src/manga_gen/errors.py — same hierarchy:
 *   MangaDSLError
 *     ├── ParseError
 *     ├── ValidationError
 *     ├── LayoutError
 *     └── RenderError
 */

/** Base class for all MangaDSL exceptions. */
export class MangaDSLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore prototype chain for instanceof checks across compiled targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when DSL source code has syntax errors. */
export class ParseError extends MangaDSLError {}

/** Raised when semantic validation fails. */
export class ValidationError extends MangaDSLError {}

/** Raised when layout computation fails (e.g., size constraints violated). */
export class LayoutError extends MangaDSLError {}

/** Raised when rendering fails. */
export class RenderError extends MangaDSLError {}
