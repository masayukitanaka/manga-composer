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
export declare class MangaDSLError extends Error {
    constructor(message: string);
}
/** Raised when DSL source code has syntax errors. */
export declare class ParseError extends MangaDSLError {
}
/** Raised when semantic validation fails. */
export declare class ValidationError extends MangaDSLError {
}
/** Raised when layout computation fails (e.g., size constraints violated). */
export declare class LayoutError extends MangaDSLError {
}
/** Raised when rendering fails. */
export declare class RenderError extends MangaDSLError {
}
//# sourceMappingURL=errors.d.ts.map