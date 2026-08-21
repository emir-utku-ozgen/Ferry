"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateIban, maskIban } = require("./iban");

test("accepts a real, checksum-valid Turkish IBAN", () => {
  const result = validateIban("TR33 0006 1005 1978 6457 8413 26");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "TR330006100519786457841326");
});

test("accepts a real, checksum-valid German IBAN", () => {
  assert.equal(validateIban("DE89370400440532013000").valid, true);
});

test("rejects a value with no recognizable IBAN shape", () => {
  const result = validateIban("not an iban");
  assert.equal(result.valid, false);
});

test("rejects a wrong-length Turkish IBAN", () => {
  const result = validateIban("TR3300061005197864578413"); // 2 short
  assert.equal(result.valid, false);
  assert.match(result.reason, /26 characters/);
});

test("rejects a correct-length, correct-country value that fails the checksum", () => {
  const result = validateIban("TR330006100519786457841327"); // last digit changed
  assert.equal(result.valid, false);
  assert.match(result.reason, /checksum/i);
});

test("is case- and whitespace-insensitive", () => {
  assert.equal(validateIban("tr33 0006 1005 1978 6457 8413 26").valid, true);
});

test("maskIban keeps the first and last 4 characters visible and masks the rest", () => {
  const { normalized } = validateIban("TR33 0006 1005 1978 6457 8413 26");
  const masked = maskIban(normalized);
  const maskedNoSpaces = masked.replace(/\s+/g, "");
  // Grouped display inserts a space every 4 characters regardless of where
  // the visible/masked boundary falls, so compare on the space-stripped
  // form for the real invariant — first/last 4 raw characters visible.
  assert.ok(maskedNoSpaces.startsWith("TR33"));
  assert.ok(maskedNoSpaces.endsWith(normalized.slice(-4)));
  assert.ok(masked.includes("*"));
  assert.ok(!masked.includes("0006100519786457841326"), "the masked digits must not appear in the output");
});

test("maskIban never reveals the full raw IBAN", () => {
  const { normalized } = validateIban("DE89370400440532013000");
  const masked = maskIban(normalized);
  assert.notEqual(masked.replace(/\s+/g, ""), normalized);
});

test("maskIban returns a value too short to usefully mask unchanged", () => {
  assert.equal(maskIban("SHORT"), "SHORT");
});
