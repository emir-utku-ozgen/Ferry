import { describe, expect, it } from "vitest";
import { HORIZON_URL, isLocalHorizonUrl, isLocalHostname, normalizeHorizonUrl } from "./config";

describe("isLocalHostname", () => {
  it("recognizes localhost and 127.0.0.1", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("LOCALHOST")).toBe(true);
  });

  it("rejects a real Horizon hostname", () => {
    expect(isLocalHostname("horizon-testnet.stellar.org")).toBe(false);
  });
});

describe("normalizeHorizonUrl", () => {
  it("leaves an already-correct https:// URL unchanged", () => {
    expect(normalizeHorizonUrl("https://horizon-testnet.stellar.org")).toBe("https://horizon-testnet.stellar.org");
  });

  it("recovers a bare, scheme-less domain to https:// — the exact misconfiguration that produced 'Cannot connect to insecure horizon server'", () => {
    expect(normalizeHorizonUrl("horizon-testnet.stellar.org")).toBe("https://horizon-testnet.stellar.org");
  });

  it("defaults a scheme-less localhost value to http://, not https://", () => {
    expect(normalizeHorizonUrl("localhost:8000")).toBe("http://localhost:8000");
  });

  it("leaves an explicit http:// localhost URL unchanged", () => {
    expect(normalizeHorizonUrl("http://localhost:8000")).toBe("http://localhost:8000");
  });

  it("strips a trailing slash", () => {
    expect(normalizeHorizonUrl("https://horizon-testnet.stellar.org/")).toBe("https://horizon-testnet.stellar.org");
  });
});

describe("isLocalHorizonUrl", () => {
  it("is true only for localhost/127.0.0.1 URLs", () => {
    expect(isLocalHorizonUrl("http://localhost:8000")).toBe(true);
    expect(isLocalHorizonUrl("http://127.0.0.1:8000")).toBe(true);
  });

  it("is false for the real Testnet Horizon URL", () => {
    expect(isLocalHorizonUrl("https://horizon-testnet.stellar.org")).toBe(false);
  });

  it("is false even for an explicit non-local http:// URL — allowHttp never applies outside localhost", () => {
    expect(isLocalHorizonUrl("http://horizon-testnet.stellar.org")).toBe(false);
  });

  it("fails closed (false) on an unparseable URL rather than throwing", () => {
    expect(isLocalHorizonUrl("not a url")).toBe(false);
  });
});

describe("HORIZON_URL (module default, no env override in this test run)", () => {
  it("resolves to the real https Testnet Horizon URL", () => {
    expect(HORIZON_URL).toBe("https://horizon-testnet.stellar.org");
  });
});
