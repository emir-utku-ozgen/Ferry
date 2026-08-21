"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { publicBaseUrl } = require("./publicBaseUrl");

test("uses http:// for a localhost Host header with no forwarded-proto (local dev, unchanged behavior)", () => {
  const result = publicBaseUrl({ host: "localhost:4001" }, "localhost:4001", {});
  assert.equal(result, "http://localhost:4001");
});

test("uses https:// for a real Host header with no forwarded-proto", () => {
  const result = publicBaseUrl({ host: "ferry-mock-anchor.onrender.com" }, "localhost:4001", {});
  assert.equal(result, "https://ferry-mock-anchor.onrender.com");
});

test("honors X-Forwarded-Proto when present, even for a non-local host", () => {
  const result = publicBaseUrl(
    { host: "ferry-mock-anchor.onrender.com", "x-forwarded-proto": "https" },
    "localhost:4001",
    {}
  );
  assert.equal(result, "https://ferry-mock-anchor.onrender.com");
});

test("takes only the first value from a comma-separated X-Forwarded-Proto", () => {
  const result = publicBaseUrl(
    { host: "ferry-mock-anchor.onrender.com", "x-forwarded-proto": "https,http" },
    "localhost:4001",
    {}
  );
  assert.equal(result, "https://ferry-mock-anchor.onrender.com");
});

test("RENDER_EXTERNAL_URL takes precedence over request headers — this is the exact fix for the reported bug", () => {
  const result = publicBaseUrl(
    { host: "localhost:4001" }, // what HOME_DOMAIN/the request would otherwise suggest
    "localhost:4001",
    { RENDER_EXTERNAL_URL: "https://ferry-mock-anchor.onrender.com" }
  );
  assert.equal(result, "https://ferry-mock-anchor.onrender.com");
});

test("HOST_URL takes precedence over RENDER_EXTERNAL_URL", () => {
  const result = publicBaseUrl(
    {},
    "localhost:4001",
    { HOST_URL: "https://custom.example.com", RENDER_EXTERNAL_URL: "https://ferry-mock-anchor.onrender.com" }
  );
  assert.equal(result, "https://custom.example.com");
});

test("strips a trailing slash from an env override", () => {
  const result = publicBaseUrl({}, "localhost:4001", { HOST_URL: "https://custom.example.com/" });
  assert.equal(result, "https://custom.example.com");
});

test("falls back to the HOME_DOMAIN parameter when no Host header is present", () => {
  const result = publicBaseUrl({}, "localhost:4001", {});
  assert.equal(result, "http://localhost:4001");
});
