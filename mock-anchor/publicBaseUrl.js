"use strict";

/**
 * The public base URL this server is actually reachable at — used to
 * build stellar.toml's advertised SEP endpoint URLs.
 *
 * HOME_DOMAIN alone isn't reliable for this: it defaults to
 * `localhost:PORT` when nobody sets it explicitly, which is exactly what
 * happened on a real Render deployment — the served stellar.toml kept
 * advertising `http://localhost:4001/auth` etc. to the outside world,
 * unreachable from anywhere but the machine running the process itself.
 *
 * Resolution order:
 *   1. `HOST_URL` — manual override, for hosts that don't set an
 *      equivalent variable (Railway, a VM, etc.).
 *   2. `RENDER_EXTERNAL_URL` — Render sets this automatically for every
 *      web service, no configuration needed.
 *   3. The actual incoming request's own `Host` / `X-Forwarded-Proto`
 *      headers — what the edge proxy that terminated *this* request
 *      reported, which is correct regardless of whether HOME_DOMAIN or
 *      either env var was ever configured. This is what makes the fix
 *      self-correcting rather than depending on an operator remembering
 *      to set one more variable.
 */
function publicBaseUrl(headers, homeDomainFallback, env = process.env) {
  const override = env.HOST_URL || env.RENDER_EXTERNAL_URL;
  if (override) return override.replace(/\/+$/, "");

  const host = String(headers.host || homeDomainFallback || "").trim();
  const hostname = host.split(":")[0].toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  const forwardedProto = headers["x-forwarded-proto"];
  const proto = forwardedProto ? String(forwardedProto).split(",")[0].trim() : isLocal ? "http" : "https";

  return `${proto}://${host}`;
}

module.exports = { publicBaseUrl };
