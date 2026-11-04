import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCollection, storeBackend } from "@/lib/mockAnchor/store";

const ENV_KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

describe("mock anchor store", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  it("falls back to memory without Redis credentials, returning copies", async () => {
    expect(storeBackend()).toBe("memory");
    const c = createCollection<{ status: string }>("t", 60);
    await c.set("a", { status: "pending" });
    const read = await c.get("a");
    read!.status = "mutated-without-save";
    expect(await c.get("a")).toEqual({ status: "pending" });
    await c.delete("a");
    expect(await c.get("a")).toBeUndefined();
  });

  it("uses Upstash REST commands with a namespaced key and TTL when configured", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.io/";
    process.env.KV_REST_API_TOKEN = "token";
    const db = new Map<string, string>();
    const calls: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const cmd = JSON.parse(String(init.body)) as string[];
        calls.push(cmd);
        let result: unknown = "OK";
        if (cmd[0] === "SET") db.set(cmd[1], cmd[2]);
        if (cmd[0] === "GET") result = db.get(cmd[1]) ?? null;
        if (cmd[0] === "DEL") result = db.delete(cmd[1]) ? 1 : 0;
        return new Response(JSON.stringify({ result }), { status: 200 });
      })
    );

    expect(storeBackend()).toBe("redis");
    const c = createCollection<{ id: string }>("quotes", 3600);
    await c.set("q1", { id: "q1" });
    expect(await c.get("q1")).toEqual({ id: "q1" });
    expect(await c.get("missing")).toBeUndefined();
    expect(calls[0]).toEqual(["SET", "ferry:mock-anchor:quotes:q1", '{"id":"q1"}', "EX", 3600]);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.upstash.io");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer token" });
  });

  it("surfaces Redis errors instead of silently losing data", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 })));
    const c = createCollection<object>("customers", 60);
    await expect(c.get("x")).rejects.toThrow(/WRONGPASS/);
  });
});
