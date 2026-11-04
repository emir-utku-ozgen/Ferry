/**
 * Key-value store behind the embedded mock anchor's customers, quotes and
 * transactions.
 *
 * On Vercel each request can land on a different serverless instance, so
 * process-local `Map`s lose data mid-flow: a SEP-12 record saved on one
 * instance is invisible to the SEP-31 request that lands on another
 * ("Sender KYC not accepted — complete SEP-12 first"). When an Upstash
 * Redis database is connected (Vercel Marketplace → Upstash, which injects
 * KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN), every instance shares one store. Without
 * those variables (local `next dev`, a single long-lived process) it falls
 * back to an in-memory Map, the previous behaviour.
 */

export interface Collection<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

interface RedisConfig {
  url: string;
  token: string;
}

function redisConfig(): RedisConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function storeBackend(): "redis" | "memory" {
  return redisConfig() ? "redis" : "memory";
}

async function redis(config: RedisConfig, command: (string | number)[]): Promise<unknown> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok || body.error) {
    throw new Error(`[mock-anchor] Redis ${command[0]} failed (${res.status}): ${body.error ?? "unknown error"}`);
  }
  return body.result;
}

function redisCollection<T>(namespace: string, ttlSeconds: number, config: RedisConfig): Collection<T> {
  const k = (key: string) => `ferry:mock-anchor:${namespace}:${key}`;
  return {
    async get(key) {
      const raw = await redis(config, ["GET", k(key)]);
      return typeof raw === "string" ? (JSON.parse(raw) as T) : undefined;
    },
    async set(key, value) {
      await redis(config, ["SET", k(key), JSON.stringify(value), "EX", ttlSeconds]);
    },
    async delete(key) {
      await redis(config, ["DEL", k(key)]);
    },
  };
}

function memoryCollection<T>(): Collection<T> {
  const map = new Map<string, T>();
  return {
    async get(key) {
      // Return a copy so callers mutate-then-save, same as with Redis.
      const value = map.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

/**
 * A named collection. The backend is chosen on first use, so env vars
 * added after a module is imported (tests) are still respected.
 */
export function createCollection<T>(namespace: string, ttlSeconds: number): Collection<T> {
  let impl: Collection<T> | null = null;
  const resolve = () => {
    if (!impl) {
      const config = redisConfig();
      impl = config ? redisCollection<T>(namespace, ttlSeconds, config) : memoryCollection<T>();
    }
    return impl;
  };
  return {
    get: (key) => resolve().get(key),
    set: (key, value) => resolve().set(key, value),
    delete: (key) => resolve().delete(key),
  };
}
