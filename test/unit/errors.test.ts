import { describe, it, expect } from "vitest";
import {
  MangaDSLError,
  ParseError,
  ValidationError,
  LayoutError,
  RenderError,
} from "../../src/errors.js";

describe("errors", () => {
  it("all subclasses extend MangaDSLError", () => {
    for (const Cls of [ParseError, ValidationError, LayoutError, RenderError]) {
      const e = new Cls("boom");
      expect(e).toBeInstanceOf(MangaDSLError);
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toBe("boom");
    }
  });

  it("sets the correct .name for each subclass", () => {
    expect(new ParseError("x").name).toBe("ParseError");
    expect(new ValidationError("x").name).toBe("ValidationError");
    expect(new LayoutError("x").name).toBe("LayoutError");
    expect(new RenderError("x").name).toBe("RenderError");
    expect(new MangaDSLError("x").name).toBe("MangaDSLError");
  });

  it("instanceof discriminates between subclasses", () => {
    const e = new ParseError("x");
    expect(e).toBeInstanceOf(ParseError);
    expect(e instanceof ValidationError).toBe(false);
  });
});
