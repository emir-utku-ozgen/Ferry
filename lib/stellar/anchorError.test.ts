import { describe, expect, it } from "vitest";
import { AnchorError, toAnchorError, toApiErrorResponse } from "./anchorError";

describe("toAnchorError", () => {
  it("passes an existing AnchorError through unchanged", () => {
    const original = new AnchorError("ANCHOR_REJECTED", "nope", 400);
    expect(toAnchorError(original, "ctx")).toBe(original);
  });

  it("classifies a DOMException TimeoutError as ANCHOR_TIMEOUT", () => {
    const err = new DOMException("aborted", "TimeoutError");
    const result = toAnchorError(err, "SEP-31 create with anchor.example");
    expect(result.code).toBe("ANCHOR_TIMEOUT");
    expect(result.message).toContain("SEP-31 create with anchor.example");
  });

  it("classifies a DOMException AbortError as ANCHOR_TIMEOUT", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(toAnchorError(err, "ctx").code).toBe("ANCHOR_TIMEOUT");
  });

  it("classifies a generic connection failure as NETWORK_ERROR", () => {
    const err = new TypeError("fetch failed");
    const result = toAnchorError(err, "ctx");
    expect(result.code).toBe("NETWORK_ERROR");
  });
});

describe("toApiErrorResponse", () => {
  it("maps ANCHOR_TIMEOUT to 504, not a generic 502, so the client can tell timeout apart from rejection", () => {
    const { status, body } = toApiErrorResponse(new AnchorError("ANCHOR_TIMEOUT", "timed out"), "fallback");
    expect(status).toBe(504);
    expect(body.code).toBe("ANCHOR_TIMEOUT");
  });

  it("maps ANCHOR_REJECTED to the anchor's own HTTP status when present", () => {
    const { status } = toApiErrorResponse(new AnchorError("ANCHOR_REJECTED", "bad request", 400), "fallback");
    expect(status).toBe(400);
  });

  it("falls back to 502 for ANCHOR_REJECTED with no status recorded", () => {
    const { status } = toApiErrorResponse(new AnchorError("ANCHOR_REJECTED", "bad request"), "fallback");
    expect(status).toBe(502);
  });

  it("maps a non-AnchorError to 502 with the fallback message", () => {
    const { status, body } = toApiErrorResponse(new Error("boom"), "fallback message");
    expect(status).toBe(502);
    expect(body.error).toBe("boom");
  });
});
