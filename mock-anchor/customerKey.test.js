"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { customerKey } = require("./customerKey");

test("distinct roles on the same account produce distinct keys", () => {
  const senderKey = customerKey("GABC123", undefined);
  const receiverKey = customerKey("GABC123", "sep31-receiver");
  assert.notEqual(senderKey, receiverKey);
});

test("defaults an unspecified type to the sender role", () => {
  assert.equal(customerKey("GABC123", undefined), "GABC123:sep31-sender");
});

test("is stable for the same account and type", () => {
  assert.equal(customerKey("GABC123", "sep31-receiver"), customerKey("GABC123", "sep31-receiver"));
});

test("different accounts under the same role produce distinct keys", () => {
  assert.notEqual(customerKey("GABC123", "sep31-receiver"), customerKey("GDEF456", "sep31-receiver"));
});
