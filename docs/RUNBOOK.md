# Ferry — Operations Runbook

**Document type:** Mainnet Readiness Pack, part 1 of 4 (SOW Deliverable 3). See also `REFUND_AND_INCIDENT_PROCEDURES.md`, `KEY_MANAGEMENT.md`, `GO_LIVE_CHECKLIST.md` in this directory.
**Scope:** how to operate, deploy, and switch Ferry between Testnet and Mainnet. Distinguishes facts already true in the codebase (stated directly, with citations) from operational decisions that only Ferry's actual operators can make (left as explicit `[ ]` placeholders — see `GAP_ANALYSIS.md` for the underlying technical rationale behind each gap).

---

## 1. What Ferry is, operationally

Ferry is a stateless Next.js orchestrator with **no database and no server-held funds or keys**. Every `/api/*` route is a thin, typed proxy between a browser and a Stellar anchor's own SEP-10/12/24/31/38 endpoints (`lib/stellar/*.ts`). Operating Ferry is therefore mostly about operating a stateless web app plus watching the anchors it talks to — there is no ledger reconciliation, no wallet balance to monitor, and no database backup/restore procedure, because none of those exist in this architecture.

This matters for on-call: a "Ferry incident" is almost always one of (a) Ferry itself being down/slow/erroring, (b) a configured anchor being down or rejecting requests, or (c) a client-side bug. It is essentially never "Ferry lost funds" — see §3.1 and `KEY_MANAGEMENT.md` for why that class of incident doesn't apply to the current architecture.

## 2. Configuration reference

All runtime configuration is environment variables, read in `lib/stellar/config.ts` and a small number of other modules. There is no other configuration surface (no admin panel, no database-backed settings).

| Variable | Read in | Purpose | Testnet value | Mainnet value |
|---|---|---|---|---|
| `NEXT_PUBLIC_HORIZON_URL` | `lib/stellar/config.ts` | Horizon endpoint used for account/trustline queries (`lib/stellar/trustline.ts`, `getHorizonServer()`) | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `lib/stellar/config.ts` | Stellar network passphrase passed to every `signTransaction()` call and trustline builder | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| `NEXT_PUBLIC_HOME_DOMAIN` | `lib/stellar/config.ts` | Sent as `home_domain` on SEP-10 challenge requests; must equal the domain Ferry is actually served from | `localhost:3000` | the real production domain, e.g. `app.ferry.example` |
| `NEXT_PUBLIC_ANCHOR_DOMAIN` | `lib/stellar/config.ts` | Default anchor domain the UI resolves SEP-1 `stellar.toml` against | `testanchor.stellar.org` | the contracted production anchor's domain (**not yet known** — see `CORRIDOR_VERIFICATION.md`) |
| `ANCHOR_ALLOWLIST` | `lib/stellar/anchorAllowlist.ts` | Comma-separated domains the server will resolve/proxy at all — every other domain is rejected before any outbound call (SSRF guard) | unset (defaults to `testanchor.stellar.org`) | must be set explicitly to only the contracted anchor domain(s) |
| `NEXT_PUBLIC_APP_URL` | `lib/stellar/config.ts` | Base URL used for server-side API route construction | `http://localhost:3000` | the real production URL |
| `NEXT_PUBLIC_EURC_ISSUER` | `lib/stellar/config.ts` | Overrides the EURC issuer used to build the `stellar:EURC:<issuer>` asset identifier | unset (defaults to Circle's real, verified Testnet issuer — `CORRIDOR_VERIFICATION.md` §5.1) | not applicable — EURC's Mainnet issuer is a separate, real address; do not reuse the Testnet default |
| `NEXT_PUBLIC_MOCK_TRY_ISSUER` | `lib/stellar/config.ts` | Overrides the mock TRY issuer used to build the `stellar:TRY:<issuer>` asset identifier | unset (defaults to the mock anchor's generated issuer — see below) | not applicable — there is no Mainnet mock anchor; TRY must come from a real contracted anchor by then |

`.env.local.example` at the repo root documents the Testnet defaults; there is currently no `.env.production.example` — creating one as part of the Mainnet cutover is item 1 in `GO_LIVE_CHECKLIST.md`.

### 2.0 The EURC → TRY corridor specifically: real EURC, mock TRY

`NEXT_PUBLIC_ANCHOR_DOMAIN` is the single anchor Ferry's UI targets for *every* pairing it currently offers — there's no per-corridor anchor routing. To run the EUR(EURC)→TRY pairing (as opposed to the USD/CAD pairs `testanchor.stellar.org` already supports), point Ferry at the mock anchor committed in `mock-anchor/`:

```
NEXT_PUBLIC_ANCHOR_DOMAIN=localhost:4001
ANCHOR_ALLOWLIST=localhost:4001
```

Full detail — what the mock anchor does and doesn't implement, why it exists instead of the real Stellar Anchor Platform, and the "TRY payout is a demo artifact, not a real payout" caveat — is in `mock-anchor/README.md` and `CORRIDOR_VERIFICATION.md` §5. One related code change worth knowing about: `lib/stellar/toml.ts` allows plain-HTTP `stellar.toml` resolution, but *only* for `localhost`/`127.0.0.1` domains (the mock anchor has no TLS certificate) — every other domain still requires HTTPS exactly as before.

### 2.1 Testnet → Mainnet switching procedure

1. Confirm a contracted production anchor exists and its domain is known (`CORRIDOR_VERIFICATION.md` — **not yet true as of this writing**; do not proceed past this step until it is).
2. In the deployment environment (not `.env.local`, which is Testnet-only and gitignored), set the six variables in the table above to their Mainnet values.
3. Set `ANCHOR_ALLOWLIST` to **only** the contracted anchor's domain — confirm `testanchor.stellar.org` is not present, even as a fallback.
4. Deploy via a reviewed config change (not a hotfix to a running instance) so the change is auditable — see §4 for the current deploy mechanism.
5. Smoke-test SEP-10 challenge/token issuance and a SEP-38 indicative price request against the real anchor before directing any real traffic at the deployment (mirrors the manual verification already on record for Testnet in `TESTNET_HASHES.md` — there is no automated smoke test yet; see `GO_LIVE_CHECKLIST.md` item 8).
6. There is intentionally no single "network mode" flag — Testnet vs. Mainnet is entirely a function of which values these six variables hold. This keeps the application code identical between environments (no `if (mainnet)` branches to audit), at the cost of the switch being "get every variable right" rather than "flip one flag." A misconfigured single variable (e.g. Mainnet Horizon URL with a Testnet network passphrase) fails loudly — Horizon rejects transactions signed for the wrong network — rather than silently mixing networks.

### 2.2 Public Testnet deployment (SOW Deliverable 3 evidence: "publicly accessible Testnet web demo")

Two separate services, two separate hosts — they have different runtime requirements and neither should be forced onto the other's platform:

| Service | Host | Why this host |
|---|---|---|
| Ferry (Next.js app) | **Vercel** | Native fit for Next.js; stateless request/response, no background process needed. |
| `mock-anchor/` (Express) | **Render or Railway** (not Vercel) | It holds in-memory state (customers/quotes/transactions `Map`s) and runs a `setInterval` payment poller every 5s — both need a long-lived process. Vercel's serverless functions are ephemeral per-request and don't support either; deploying `mock-anchor/` there would silently lose all state between requests and the poller would never run. Render/Railway both run it as a persistent Node process, matching `npm start`. |

**Deploy `mock-anchor/` first** (Ferry's env vars depend on knowing its final domain):

1. Push `mock-anchor/` as its own service (Render: "New Web Service" pointed at this repo with root directory `mock-anchor/`; Railway: same, or `railway up` from within `mock-anchor/`). Build command: `npm install`. Start command: `npm start`.
2. Set these env vars on the host (do **not** set `PORT` — both platforms inject it, and `server.js` already reads `process.env.PORT`):
   | Var | Value |
   |---|---|
   | `HOME_DOMAIN` | the hostname the platform assigns, e.g. `ferry-mock-anchor.onrender.com` — **no scheme, no port** |
   | `SIGNING_SECRET` | a pinned Testnet secret key (generate once locally via `node -e "console.log(require('@stellar/stellar-sdk').Keypair.random().secret())"`, fund it via Friendbot, then pin it here — leaving this unset works but rotates the anchor's identity on every redeploy, which breaks any client that cached the old `stellar.toml`) |
   | `TRY_ISSUER_SECRET` | same idea, a second pinned keypair |
   | `JWT_SECRET` | any random string — rotate on redeploy is fine, it only invalidates outstanding SEP-10 sessions |
   | `MOCK_PAYOUT_DEMO_ACCOUNT` | optional, only if you want the demo TRY payout leg |
3. Confirm `GET https://<that-domain>/health` returns `{"ok":true,...}` and `GET https://<that-domain>/.well-known/stellar.toml` shows `https://` endpoints (the fix in this session's `server.js` makes this automatic — it only uses `http://` for `localhost`/`127.0.0.1`, matching `lib/stellar/toml.ts`'s own rule exactly).

**Then deploy Ferry to Vercel:**

1. Import the repo in Vercel (framework preset: Next.js — zero extra build config needed, `next.config.ts` has no custom settings to carry over).
2. Set these Project → Environment Variables (Production, or a Preview environment if you want a non-production URL first):
   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
   | `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
   | `NEXT_PUBLIC_HOME_DOMAIN` | the Vercel domain Ferry itself will be served from, e.g. `ferry-demo.vercel.app` — must match exactly, it's sent as SEP-10's `home_domain` |
   | `NEXT_PUBLIC_ANCHOR_DOMAIN` | the `mock-anchor/` domain from above, e.g. `ferry-mock-anchor.onrender.com` |
   | `ANCHOR_ALLOWLIST` | same value as `NEXT_PUBLIC_ANCHOR_DOMAIN` (server-only var — this is the one the code actually reads; an env named `NEXT_PUBLIC_ANCHOR_ALLOWLIST` does **not** exist in the codebase and is a no-op if set) |
   | `NEXT_PUBLIC_APP_URL` | `https://ferry-demo.vercel.app` (full URL, with scheme) |
   `NEXT_PUBLIC_EURC_ISSUER` / `NEXT_PUBLIC_MOCK_TRY_ISSUER` can stay unset — Ferry discovers both from the anchor's own `stellar.toml` at request time (`mock-anchor/README.md`); only set them if you need to override the default.
3. Deploy. Smoke-test the same way as §2.1 item 5: SEP-10 challenge, then a SEP-38 price request, against the live URL before sharing it.
4. **Freighter itself needs no config change** — it's a browser extension the visitor already has, pointed at Testnet on their end; Ferry's `WalletConnect.tsx` only checks that Freighter's active network matches `NEXT_PUBLIC_NETWORK_PASSPHRASE` (fixed this session — see `GAP_ANALYSIS.md`'s P1-3).

## 3. What's true today (facts derivable from the codebase)

- **No custody.** Ferry holds no funds and no private keys (`GAP_ANALYSIS.md` §3; `KEY_MANAGEMENT.md` §1) — there is no "Ferry wallet" to fund, monitor, or protect.
- **Bounded anchor calls.** Every anchor-facing call is bounded to a 10s timeout (`ANCHOR_TIMEOUT_MS`, `lib/stellar/anchorError.ts`) via `AbortSignal.timeout()` in `lib/stellar/anchorFetch.ts`, and read-only GET calls retry twice with exponential backoff + jitter on connectivity failures only (`anchorFetch()`, same file) — a slow or unreachable anchor produces a typed `504`/`502` response, not a hung request.
- **Idempotent writes.** State-mutating routes (SEP-24 deposit/withdraw init, SEP-31 create, SEP-12 submit) honor a client-supplied `Idempotency-Key` header via `lib/idempotency.ts` and `lib/apiInstrumentation.ts`'s `withInstrumentation()` wrapper — a retried request with the same key replays the original response instead of resubmitting to the anchor.
- **Structured logs.** Every instrumented route emits a JSON log line via `lib/logger.ts` (`route`, `event`, `transferId`, `status`, `code`, `durationMs`) to stdout — most hosts (including Vercel) capture stdout as structured logs with no external logging dependency required.
- **Live audit trail, session-scoped.** `lib/auditTrail.ts` records each transfer's event history in-process, keyed by the SEP-38 quote id, exposed at `GET /api/audit/[transferId]` and rendered live in the UI (`components/StatusTracker.tsx`). This is **not durable** — it's an in-memory `Map` that doesn't survive a restart or scale across instances. See `GAP_ANALYSIS.md` §6 item 7 for the recommended follow-up (a real datastore).
- **Domain allowlist.** `lib/stellar/anchorAllowlist.ts` rejects any anchor domain not in `ANCHOR_ALLOWLIST` before any outbound request is made — this is Ferry's SSRF/open-relay guard, since every `/api/*` route otherwise accepts a client-supplied `domain`.
- **Rate limiting, process-local.** `lib/rateLimit.ts` is a fixed-window counter per (route, client IP), held in an in-memory `Map` — bounds per-instance abuse but **does not** share state across a horizontally-scaled deployment.

## 4. Deployment

Deploys currently go through the standard Next.js/Vercel git-integration flow (push to the tracked branch → build → deploy) — there is no custom CI/CD pipeline, canary process, or feature-flag system in this repository (`grep -rn "canary\|feature.flag" --include="*.ts" --include="*.tsx"` returns nothing). `npm run build` runs `next build`, which also runs the TypeScript compiler as part of the build (a build failure blocks deploy). `npm run lint` runs ESLint separately; it is not currently wired into the build itself.

## 5. Decisions needed before go-live

These are organizational choices, not code — inventing values here would misrepresent Ferry's actual operational readiness. Track against `GO_LIVE_CHECKLIST.md`.

| Item | Owner | Decision |
|---|---|---|
| On-call rotation for orchestrator downtime | `[ ]` | `[ ]` |
| Alerting thresholds (error rate, anchor timeout rate, rate-limit rejection rate) — `lib/logger.ts` now emits the data an alerting rule would key off, but no alerting system consumes it yet | `[ ]` | `[ ]` |
| Log retention & PII handling policy for anchor error payloads (may contain partial customer data echoed back in an anchor's rejection message) | `[ ]` | `[ ]` |
| Deployment rollback procedure (current deploys are via Vercel's git integration; a documented rollback trigger/owner is not yet defined) | `[ ]` | `[ ]` |
| Anchor allowlist change-control process (who approves adding a new `ANCHOR_ALLOWLIST` entry, and how) | `[ ]` | `[ ]` |
| Migration plan for `lib/rateLimit.ts` / `lib/idempotency.ts` / `lib/auditTrail.ts` to a shared store, required once more than one instance runs concurrently | `[ ]` | `[ ]` — each module's own docstring already flags this as its next step |

---

*Every unchecked `[ ]` above is a genuine open item, not a formality — see `GAP_ANALYSIS.md` for the technical detail behind each and `GO_LIVE_CHECKLIST.md` for how these roll up into a single pre-launch checklist.*
