"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateIban } = require("./iban");

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
