# Ferry — SOW Compliance & Gap Assessment

**Document type:** SOW compliance assessment
**Scope:** Ferry remittance orchestration application — Next.js 16 (App Router) / TypeScript / Tailwind CSS, `@stellar/stellar-sdk` ^15.1.0, `@stellar/freighter-api` ^6.0.1. No test runner, no database, no CI configuration present in the repository (verified: `package.json` has no `test` script and no test-framework dependency; no `*.test.*`/`*.spec.*` files; no `.github/workflows`).
**Reference:** Instawards SOW, 30-Day Scoped Engagement

---

## 1. Executive Summary

Ferry's protocol-orchestration core — the actual SEP-10, SEP-38, SEP-12, and SEP-24 request/response plumbing — is real, live-tested against Stellar Testnet and the public reference anchor (`testanchor.stellar.org`), and reasonably well-engineered: typed error handling, a 10-second timeout on every anchor call, per-IP rate limiting, and a domain allowlist are all genuinely implemented and verifiable in the code cited below. The sender-facing UI for Deliverable 3 is substantially built: `components/QuoteCalculator.tsx` shows the exact net TRY amount before locking a quote, and `components/StatusTracker.tsx` provides live step tracking with dedicated error screens for several failure modes. This is the strongest part of the codebase relative to the SOW.

Everything else has significant, evidenced gaps, though two of them have since closed. **Deliverable 1 is essentially unmet**: no anchor has confirmed EUR/TRY support in writing (`CORRIDOR_VERIFICATION.md` is an explicitly-labeled template with every field blank), the cost baseline is illustrative market knowledge rather than measured same-day quotes, and no go/no-go decision document exists anywhere in the repo. **Deliverable 2 is partially met, and materially improved**: idempotency (`lib/idempotency.ts`), retry-with-backoff on read-only anchor calls (`lib/stellar/anchorFetch.ts`), structured logging (`lib/logger.ts`), and a live in-memory audit trail (`lib/auditTrail.ts`, `GET /api/audit/[transferId]`) are now all genuinely implemented — but the gap that matters most is unchanged: SEP-31 transaction creation has still never once succeeded against the configured anchor in any test run on record (`TESTNET_HASHES.md` §7 — anchor returns `"Asset [USDC] has no fields definition"` on every attempt), and there is still no automated test suite of any kind and no monitoring/alerting. **Deliverable 3's UI gap has closed**: a dedicated recipient claim route now exists at `app/claim/[id]/page.tsx`, with real IBAN format validation (`lib/iban.ts`), and `components/StatusTracker.tsx` now tracks the SOW's exact four-step lifecycle wording. What's still missing from Deliverable 3 is a recorded demo video — and, per the point below, a genuine one still can't be recorded yet.

The compounding effect: because SEP-31 (the only implemented path that actually moves value between anchors) has never completed successfully, **Deliverable 3's own success criterion — "the same amount delivered at the end" — cannot currently be demonstrated end-to-end**, regardless of how complete the surrounding UI now is. This remains the central, current blocker the rest of this document explains and prioritizes.

---

## 2. Deliverable 1 — Corridor Verification, Pilot Terms and Cost Baseline

| Criterion | Status | Evidence / File | Notes |
|---|---|---|---|
| Written anchor confirmation — EUR sending side | ❌ | `CORRIDOR_VERIFICATION.md` §1 | Every field in the table (`Anchor legal name`, `domain`, `Status`, etc.) is the literal placeholder `[ ]`. The document's own header states: "No EUR→TRY anchor relationship currently exists in the codebase." |
| Written anchor confirmation — TRY receiving side | ❌ | `CORRIDOR_VERIFICATION.md` §2 | Same — all fields unfilled. |
| SEP-38/31/12/24 support confirmed on a real EUR/TRY anchor | ❌ | `TESTNET_HASHES.md` §4, live test log | The only anchor Ferry is configured against (`testanchor.stellar.org`, default in `lib/stellar/config.ts` line 28) does not support EUR or TRY: a live `GET /price` request for `iso4217:EUR`→`iso4217:TRY` returns HTTP 404 `{"error":"sell_asset not found"}` (`TESTNET_HASHES.md`, "EUR->TRY price on testanchor" test). |
| Mainnet endpoints documented | ❌ | `MAINNET_READINESS.md` §4.2 | Checklist item "EUR-side anchor relationship signed" / "TRY-side anchor relationship signed" both unchecked; no Mainnet endpoint values recorded anywhere in the repo (`lib/stellar/config.ts` only defines Testnet defaults). |
| Transfer limits documented | ❌ | `CORRIDOR_VERIFICATION.md` §3 | Table row "Minimum/Maximum transaction amount" is `[ ]` for both anchors. |
| Fees documented | ❌ | `CORRIDOR_VERIFICATION.md` §3 | "Fee structure" row is `[ ]`. |
| Quote validity windows documented | ❌ | `CORRIDOR_VERIFICATION.md` §3 | "SEP-38 quote validity window" row is `[ ]`. Only known data point: the reference anchor's fixed `2026-08-14T12:00:00Z` cutoff (`TESTNET_HASHES.md` §4), which is a demo-anchor artifact, not a documented production value. |
| Refund procedures documented in writing | ❌ | `CORRIDOR_VERIFICATION.md` §3, §4 | "Refund policy: trigger conditions / SLA / who bears FX loss" all `[ ]`. |
| Pilot willingness documented | ❌ | `CORRIDOR_VERIFICATION.md` §4 | "Pilot duration," "Pilot fee arrangement," "Success criteria" all `[ ]`. |
| Measured 3-channel cost baseline (same amount, same day) | ❌ | `COST_BASELINE.md` §1 | The document's own header states these are "indicative ranges, not live-verified quotes" and explicitly recommends the team "pull current, dated quotes directly from each provider... before this document is used in any external submission." No date, no fixed amount held constant, no source citation for any of the three incumbent-channel rows. |
| Documented go/no-go decision | ❌ | *(no file)* | No file in the repository root or elsewhere contains a go/no-go decision. Grep for "go/no-go", "go-no-go", "decision" across `*.md` returns no relevant match. |

**Deliverable 1 status: not met.** Every sub-criterion is either explicitly templated-and-unfilled or explicitly labeled illustrative. This is not a partial-completion situation — the underlying business activity (anchor outreach, measured quotes, a go/no-go call) has not happened, and the repository's own documents say so directly rather than papering over it.

---

## 3. Deliverable 2 — Production-Grade Orchestration Service

### SEP-10 Authentication

✅ **Implemented and live-verified.**
- `lib/stellar/sep10.ts` lines 27–48 (`requestChallenge`) and 50–74 (`submitSignedChallenge`) implement the challenge-fetch and signed-transaction-exchange calls against the anchor's `WEB_AUTH_ENDPOINT`.
- `app/api/sep10/challenge/route.ts` and `app/api/sep10/token/route.ts` expose these as rate-limited orchestrator routes (`checkRateLimit(req, "sep10-challenge")` / `"sep10-token"`).
- `components/RemittanceFlow.tsx` lines 34–56 drive the client side: fetch challenge → `signTransaction()` via Freighter (line 41) → exchange for JWT (line 49). No secret key is ever seen by Ferry — confirmed by the fact `signTransaction` is called with only `{ networkPassphrase, address }`, never a key.
- Live-tested end to end per `TESTNET_HASHES.md` §2: a real 428-character JWT obtained from `testanchor.stellar.org`.

### SEP-38 Quote + Rate Lock + Expiry

✅ **Implemented, with expiry now enforced client-side** (⚠️ not anchor-side, see below).
- `lib/stellar/sep38.ts`: `getIndicativePrice()` (line 62) and `postFirmQuote()` (line 78), both including the `Sep38Fee` breakdown (lines 23–27) added to the response types.
- `components/QuoteCalculator.tsx`: `lockRate()` (lines 107–124) requests a firm quote; the locked quote's `buy_amount` — the exact net TRY figure — is rendered at line 217 (`Net {lockedQuote.buy_amount} {currencyLabel(...)}`), not the gross send amount.
- **Expiry enforcement is real and client-side, not anchor-verified:** `QuoteCalculator.tsx` lines 82–84 compute `quoteExpired` from a ticking `now` state (lines 71, 76–80) and conditionally render a "Refresh quote" action (lines 226–236) instead of the amount. `components/TransferPanel.tsx` lines 381, 384–389 independently re-check expiry in `Sep31Panel.send()` and block submission with a `FlowError` of type `quote_expired` if the locked quote has passed `expires_at`.
- ⚠️ **Caveat, evidenced in `TESTNET_HASHES.md`'s own findings table:** the reference anchor ignores the `expire_after` request parameter and always returns the same fixed `expires_at`, and a SEP-31 create call using an intentionally-expired `quote_id` could not be tested because the anchor rejects every SEP-31 create attempt earlier, for an unrelated reason (see Failure Matrix below). **Anchor-side rejection of an expired quote has never been observed — only Ferry's own client-side block has been exercised.**

### SEP-12/24 KYC Handoff

✅ SEP-12 relay implemented and live-verified. ✅ **A distinct recipient claim route now exists** (this closes the gap previously described in this section as "not a hosted screen" / "no distinct recipient URL"). ⚠️ The sender's own KYC step remains an in-app modal, which is a separate, still-accurate observation — see below.
- `lib/stellar/sep12.ts`: `getCustomerInfo()` (line 47), `submitCustomerInfo()` (line 76), `deleteCustomerInfo()` (line 65) — full GET/PUT/DELETE proxy to the anchor's `KYC_SERVER`.
- `app/api/sep12/customer/route.ts` exposes all three as rate-limited, idempotency- and audit-trail-instrumented routes (via `withInstrumentation()`, `lib/apiInstrumentation.ts`).
- **Recipient path (new):** `app/claim/[id]/page.tsx` is a dedicated URL a sender shares after locking a quote — generated by `components/TransferPanel.tsx`'s `Sep31Panel.recipientLink()` (line 396), which embeds the anchor domain, the sender's SEP-10 token, the sender's account, and the locked quote's net amount/asset as query params. `app/claim/page.tsx` handles the bare route with no id, showing an explanatory "waiting on a payment link" screen rather than erroring. The recipient — with no Stellar wallet and no prior Ferry session — enters their name and IBAN there; submission is typed `sep31-receiver` (`RECEIVER_TYPE`, `app/claim/[id]/page.tsx` line 8) so the anchor returns the receiver's own field set, not the sender's.
- **Known limitation, stated in the claim page's own comment rather than hidden:** it authenticates its SEP-12 calls using the *sender's* SEP-10 token, embedded in the share-link query string by whoever generated the link, rather than a receiver-scoped credential minted server-side. A production version needs a backend session store to do that properly; this Testnet prototype doesn't have one.
- **Sender path (unchanged):** `components/KycModal.tsx` dynamically renders a form from the anchor's own required-field list (lines 70–72, 106–120), with a "Bank / IBAN details" section built from `BANK_FIELD_ORDER = ["bank_name", "bank_account_number", "bank_account_type", "bank_number"]` (line 24). This is still opened via `onOpenKyc` from `TransferPanel.tsx`'s `Sep31Panel`, inside the same browser session as the connected sender wallet — that observation from the prior version of this document was about the *sender's* KYC step specifically, and remains true; it's the *recipient's* KYC step that the SOW's "hosted screen" language was actually about, and that gap is what's now closed.
- ✅ **IBAN-specific validation now exists.** `lib/iban.ts` implements real ISO 13616 format validation — a per-country fixed-length table plus the mod-97-10 checksum every valid IBAN satisfies, not a cosmetic regex — covering the EUR/TRY corridor and its neighbors. It's wired into both `components/KycModal.tsx`'s `bank_account_number` field and `app/claim/[id]/page.tsx`'s IBAN input, rejecting a malformed IBAN client-side before submission in either place.
- SEP-24's hosted handoff remains a genuine anchor-hosted screen: `lib/stellar/sep24.ts` `initInteractiveDeposit`/`initInteractiveWithdrawal` return the anchor's own `url`, opened via `window.open()` in `TransferPanel.tsx` line 262. The recipient claim page is a related but distinct pattern — the recipient's *fields* are entered on a Ferry-hosted page and relayed to the anchor's `KYC_SERVER` API, rather than the recipient being redirected into the anchor's own rendered UI the way SEP-24 does — worth naming precisely rather than conflating the two.

### SEP-31 Transfer Creation

⚠️ **Implemented but never observed to succeed — this is Ferry's single current blocker to a genuine end-to-end demo.** With Deliverable 3's UI-side gaps now closed (recipient claim route, status tracker labels — see §4), this is the one remaining thing standing between the current codebase and a reviewer being able to watch a transfer actually settle.
- `lib/stellar/sep31.ts`: `createSep31Transaction()` (line 54), `getSep31Transaction()` (line 77), `getSep31Info()` (line 46).
- `app/api/sep31/transactions/route.ts` exposes POST (create, idempotency- and audit-instrumented via `withInstrumentation()`) and GET (status lookup), both rate-limited.
- `components/TransferPanel.tsx` `Sep31Panel.send()` (lines 415–451) calls this with the locked quote's `id` as `quote_id`.
- ❌ **Every recorded attempt to create a SEP-31 transaction against the configured public anchor fails**, currently and consistently, with `HTTP 400 {"error":"Asset [USDC] has no fields definition"}` (`TESTNET_HASHES.md` §7), reproduced independently across multiple test accounts with and without completed SEP-12 KYC. This means the `result` success-path UI in `TransferPanel.tsx` (rendering `stellar_account_id` / `stellar_memo`) has no known instance of ever having rendered with real data — it is implemented but functionally unverified.
- **Root cause, restated precisely:** this is a server-side SEP-31 `fields` configuration gap on `testanchor.stellar.org` itself (Ferry's request is well-formed and typed error handling surfaces the rejection cleanly rather than masking it) — not a bug Ferry's own code can fix, and not something a corridor-specific anchor relationship (Deliverable 1) would necessarily resolve either, since it's a property of *this specific* public demo anchor's configuration. The concrete unblock is a test anchor Ferry actually controls — see the remediation roadmap's recommendation to stand up a local Anchor Platform instance.

### Idempotent State Machine, Retry/Timeout Handling

✅ **Idempotency. ✅ Retries (scoped). ✅ Timeouts. ❌ Still no formal state machine.**
- **Timeouts:** genuinely implemented. `lib/stellar/anchorFetch.ts` attaches `AbortSignal.timeout(ANCHOR_TIMEOUT_MS)` (10,000ms, `lib/stellar/anchorError.ts`) to every anchor-facing `fetch()`; `lib/stellar/toml.ts` passes the same bound to the SDK's TOML resolver.
- **Retries:** ✅ now implemented, deliberately scoped. `lib/stellar/anchorFetch.ts`'s `anchorFetch()` accepts a `retries` option and retries with exponential backoff + jitter (`backoffMs`) — but only on connectivity-level failures (`ANCHOR_TIMEOUT` / `NETWORK_ERROR`); a definite anchor response, including a 5xx, is returned as-is and never retried, because the anchor already answered. Read-only GET calls pass `retries: 2` explicitly (`lib/stellar/sep12.ts`, `sep24.ts`, `sep38.ts`, `sep31.ts`'s `getSep31Info`) since re-issuing a GET is always safe; state-mutating calls (SEP-24 session creation, SEP-31/SEP-12 submission) still default to zero automatic retries, since blindly retrying a call that may have already reached the anchor risks a duplicate — that risk is instead covered by idempotency, below.
- **Idempotency:** ✅ now implemented. `lib/idempotency.ts` is a process-local, TTL-bounded (5-minute) cache keyed by the client-supplied `Idempotency-Key` header. `lib/apiInstrumentation.ts`'s `withInstrumentation()` wrapper checks it before every state-mutating route handler runs (SEP-24 deposit/withdraw init, SEP-31 create, SEP-12 submit) and replays the cached response — with an `X-Idempotent-Replay: true` header — on a repeat key instead of re-submitting to the anchor. Stated scope caveat, in the file itself: in-memory, so it doesn't survive a restart or share state across horizontally-scaled instances; a production deployment needs a shared store (e.g. Redis), same caveat as the rate limiter below.
- **State machine:** ❌ still no formal state machine exists. The transfer's state (`sep10Token`, `lockedQuote`, `kycStatus`, `transferStatus`, `flowError`) remains five independent `useState` calls in `app/page.tsx` (lines 16–23), updated imperatively by different components calling different setter props — there is no reducer and no explicit state graph. This is a separate gap from the audit trail below: `lib/auditTrail.ts` now records each transition's *history* for inspection, but nothing yet enforces which transitions are *valid*, and a page refresh still loses all live transfer state.

### Failure Matrix

The SOW requires: *"Complete failure matrix implemented and tested: anchor rejection, failed KYC, invalid IBAN, expired quote — every path ending in a clean refund."*

| Failure mode | Implemented? | Tested? | Ends in refund? |
|---|---|---|---|
| Anchor rejection | ✅ `FlowErrorType: "anchor_rejected"`, `StatusTracker.tsx` lines 42–45 | ✅ Real, reproduced (`TESTNET_HASHES.md` §7) | ❌ No refund logic exists — see below |
| Failed KYC | ✅ `FlowErrorType: "kyc_rejected"`, `StatusTracker.tsx` lines 50–53 | ❌ Attempted live with deliberately malformed data; the reference anchor performed no validation and returned `ACCEPTED` regardless (`TESTNET_HASHES.md`, "Failure scenarios... not genuinely reproducible" table) | ❌ No refund logic exists |
| Invalid IBAN | ✅ Client-side format validation now exists (`lib/iban.ts` — ISO 13616 length table + mod-97-10 checksum), wired into both `components/KycModal.tsx` and `app/claim/[id]/page.tsx`. ⚠️ Separately, the app-level `FlowErrorType: "invalid_recipient_details"` (`StatusTracker.tsx` lines 51–54) is still reached only by regex-matching the anchor's free-text rejection message for `bank|iban|account.number|routing` (`TransferPanel.tsx` line 79) — a *structurally valid* IBAN the anchor itself refuses still isn't a reproducible case that way | ✅ Client-side rejection reproducible and tested; ⚠️ anchor-side rejection of a well-formed-but-refused IBAN still untested | ❌ No refund logic exists |
| Expired quote | ✅ Client-side block implemented (`QuoteCalculator.tsx` lines 226–236, `TransferPanel.tsx` lines 384–389) | ⚠️ Client-side block verified; anchor-side rejection of an expired `quote_id` never observed (blocked by the SEP-31 asset-config error first) | ❌ No refund logic — not applicable since no submission is allowed to reach the anchor |
| **Refund (all paths)** | ❌ **Not implemented at all** | ❌ | — |

**On refunds specifically:** `grep -rn "refund" --include="*.tsx" --include="*.ts"` across the entire codebase returns exactly one match: the string literal `"refunded"` in `TransferPanel.tsx` line 34, as one entry in a `Set` of SEP-24 terminal statuses that merely stops the polling loop (line 225). There is no code path that initiates a refund, tracks a refund's progress, or displays refund-specific information to the user beyond generically showing whatever status string the anchor reports. **"Every path ending in a clean refund" is not met by any path**, because Ferry has no refund mechanism to end in.

### Logging, Audit Trail, Automated Tests, Monitoring

⚠️ **Two of four now implemented; automated tests and monitoring remain unmet.**
- **Structured logs:** ✅ implemented. `lib/logger.ts` (`logger.info` / `.warn` / `.error`) emits structured JSON lines and is wired into every state-mutating orchestrator route via `withInstrumentation()` (`lib/apiInstrumentation.ts`), which logs the route, event, transfer id, response status, anchor error code, and call duration on every request.
- **Audit trail per transfer:** ✅ implemented, with a stated scope caveat. `lib/auditTrail.ts` records each transfer's event history in an in-memory `Map`, keyed by the SEP-38 quote id (the first stable identifier that exists in the flow), exposed at `GET /api/audit/[transferId]` and rendered live in `components/StatusTracker.tsx` (polling every 5s). The module's own docstring states the limitation plainly: process-local, not persisted across restarts, not shared across horizontally-scaled instances — a production deployment needs a real datastore, not an in-memory `Map`. Still no database exists in the project (`grep -rni "database|postgres|sqlite|prisma|drizzle|mongodb|supabase"` returns nothing) — this is a session-scoped audit trail, not a durable one.
- **Automated tests:** ❌ still absent. `package.json` has no `test` script (only `dev`, `build`, `start`, `lint`). No test-framework dependency (`jest`, `vitest`, `playwright`, `@testing-library/*`) appears in `dependencies` or `devDependencies`. No file matching `*.test.*` or `*.spec.*` exists anywhere in the repository.
- **Monitoring and alerting:** ❌ still absent. `grep -rni "monitor|alerting|sentry|datadog|logtail|pino|winston"` across all source and config files returns zero matches. No health-check endpoint, no error-tracking SDK, no uptime/alerting configuration exists. The rate limiter (`lib/rateLimit.ts`) tracks rejection counts internally but nothing surfaces or alerts on them.

**Deliverable 2 status: partially met, materially improved since the prior version of this document.** The four SEP integrations are real, and SEP-10/38/12 are genuinely demonstrable end-to-end. Idempotency, scoped retry-with-backoff, structured logging, and a live (session-scoped) audit trail are now all real, verifiable engineering — timeout handling and typed error codes were already solid. But SEP-31 — the deliverable's own money-movement step, and the only mechanism that actually moves value to a recipient — has still never completed (see above, now the single most critical open item in this deliverable), there is still no refund mechanism, and automated tests and monitoring remain entirely absent.

---

## 4. Deliverable 3 — Sender/Recipient Web Experience + Mainnet Readiness Pack

### Sender: Net TRY Amount Display Prior to Payment

✅ **Implemented.** `components/QuoteCalculator.tsx` line 190 ("Recipient nets ≈ {indicative.buy_amount}...") for the unauthenticated preview, and line 217 ("Net {lockedQuote.buy_amount}...") for the locked, guaranteed figure, both rendered before any SEP-24/31 submission is possible. Fee breakdown shown via the `FeeBreakdown` component (lines 40–53), sourced from the anchor's own SEP-38 `fee` object.

### Sender: Live Status Tracking UI

✅ **Implemented, and now labeled to match the SOW exactly.** `components/StatusTracker.tsx` renders a 4-step tracker (`STEPS`, lines 25–30) whose labels are now the SOW's own wording verbatim: *Quote Locked → KYC Verified → Settling (Stellar Testnet) → Completed / Delivered* (previously "Deposit Initiated" / "Settled in Lira" — a cosmetic rename only). `currentStepIndex()` (lines 61–67) still derives progress from real app state (`hasQuote`, `kycStatus`, `transferStatus`); `TransferPanel.tsx`'s SEP-24 polling loop (lines 218–233) still updates `transferStatus` on a 4-second interval via `onTransferStatusChange`, which flows into the tracker live.
- ⚠️ Note: the "Completed / Delivered" step (index 3, `SETTLED_STATUSES = new Set(["completed"])`, `StatusTracker.tsx` line 32) has never been reached in any recorded test, since it depends on either a human completing the anchor's hosted SEP-24 form (not automatable) or a successful SEP-31 transaction (never achieved — see the SEP-31 blocker in §3). The label rename doesn't change this: the step is exactly as unreached as it was under its old name.

### Recipient: Link Handling, IBAN Input, Hosted KYC Flow

✅ **Implemented — a dedicated recipient claim route now exists.**
- `app/claim/[id]/page.tsx` is a distinct URL the sender shares after locking a quote, generated by `components/TransferPanel.tsx`'s `Sep31Panel.recipientLink()` (line 396) with the anchor domain, sender's SEP-10 token, sender's account, and the locked quote's net amount/asset embedded as query params. `app/claim/page.tsx` handles the bare route (no id/params) with an explanatory "waiting on a payment link" screen. This closes the prior finding that no shareable transaction link or recipient-scoped URL existed anywhere in the codebase.
- The recipient — with no Stellar wallet and no prior Ferry session — enters their name and a real, validated IBAN there (`lib/iban.ts`: ISO 13616 length table + mod-97-10 checksum, not a cosmetic regex — closes the prior "no IBAN input field exists" finding). Submission is relayed to the anchor's own SEP-12 `KYC_SERVER` via the existing `/api/sep12/customer` route, typed `sep31-receiver` so the anchor returns the receiver's field set specifically.
- ⚠️ **Precision on "hosted":** this is closer to, but not identical to, the SOW's literal "completes identity verification on the anchor's hosted screen" wording. The recipient's KYC *fields* are entered on a Ferry-hosted page and relayed via API to the anchor — the recipient is not redirected into the anchor's own rendered UI the way the SEP-24 path's `window.open(result.url, ...)` (`TransferPanel.tsx` line 262) genuinely does. What the prior version of this document called a structural gap — "the underlying routing/architecture to support a second party's access doesn't exist yet" — is closed: the sender's and recipient's KYC surfaces are now cleanly separated (`components/KycModal.tsx` for the sender's own session; `app/claim/[id]/page.tsx` for the recipient's own distinct link), even though the recipient's hand-off mechanism is a relay rather than a redirect.
- Known limitation, stated in the claim page's own comment: it authenticates using the *sender's* SEP-10 token embedded in the share-link query string rather than a receiver-scoped credential minted server-side — a stated Testnet-prototype simplification (no backend session store exists to mint one), not a hidden gap.

### Designed Error Screens for Failure States

⚠️ **Mostly implemented for anticipated failures; no fallback for unanticipated ones.**
- Anticipated, named failure states have real, designed UI: `StatusTracker.tsx` lines 37–54 (`ERROR_COPY`) render titled, explained error cards for `quote_expired`, `anchor_rejected`, `invalid_recipient_details`, `kyc_rejected`. `TransferPanel.tsx` also shows inline errors for trustline failures (lines 307–329) and low-reserve XLM failures (line 211, using `describeLowReserveError`).
- ❌ **No top-level React error boundary exists.** `find app -iname "error.tsx"` returns nothing. An exception outside the specifically-anticipated `try/catch` blocks (e.g., a rendering error, an unexpected null) would surface as Next.js's default unstyled dev/prod error overlay, not a designed screen — a literal "dead end" relative to the SOW's own phrasing.

### Recorded End-to-End Demo

❌ **Missing, no reference found in the repository.** No video file (`find . -iname "*.mp4" -o -iname "*.mov" -o -iname "*.webm" -o -iname "*.gif"` returns nothing under version control), no link to an externally-hosted recording in any `.md` file (`grep -rni "loom|youtube|vimeo|demo video|screen recording" *.md` returns nothing), and no mention in `README.md`, which is still the unedited `create-next-app` boilerplate.

### Mainnet Readiness Pack

⚠️ **Present as a structured document, explicitly incomplete by its own labeling.**
- `MAINNET_READINESS.md` exists and covers all four required sections (Operations Runbook §1, Refund & Incident Procedures §2, Key Management Plan §3, Go-Live Checklist §4).
- The document's own header states it is a "**TEMPLATE**" and that every `[ ]`-marked field is "not yet made." Spot-checking: §1.2 "Alerting thresholds" — `[ ]`; §2.2 "Confirmed refund SLA per contracted anchor" — `[ ]`, cross-referenced to `CORRIDOR_VERIFICATION.md` which is also unfilled; §4.2 (business/legal checklist) has zero items checked.
- What *is* concretely true and documented (§1.1, §3.1): Ferry holds no funds and no private keys, so a traditional custody/key-management plan does not apply to the current architecture "as long as it remains a pure orchestrator" — this is an accurate statement grounded in the actual codebase, not a gap.

**Deliverable 3 status: substantially met on the UI side; still blocked on a genuine end-to-end demo.** The sender-side experience (amount shown before paying, live status now labeled exactly per the SOW, several designed error screens) is real. The recipient-side experience — a distinct link, a validated IBAN field, a relay to the anchor's own KYC service — now exists too, closing what was previously this deliverable's most structural gap. What remains: no demo recording exists, and none can honestly show the tracker's final two steps until Deliverable 2's SEP-31 blocker (§3) is resolved — recording a walkthrough that stops short of "Completed / Delivered" would misrepresent the product rather than demonstrate it. The readiness pack is still a well-organized checklist, not a completed pack.

---

## 5. Critical Gaps (Priority Order)

The item previously ranked #2 here — no recipient-facing flow existing at all — has since been resolved (`app/claim/[id]/page.tsx`) and is removed from this list; see §4 for the closed-gap detail. The status tracker's step labels were also updated to match the SOW's wording (`components/StatusTracker.tsx`), though that was never a separately-ranked gap on its own. The remaining gaps below are current.

1. **SEP-31 transaction creation has never succeeded against the configured anchor — now the single most critical open item in this document.** (`lib/stellar/sep31.ts`, `components/TransferPanel.tsx` `Sep31Panel`, evidenced in `TESTNET_HASHES.md` §7 — `HTTP 400 "Asset [USDC] has no fields definition"` on every attempt) This is critical because it is the one mechanism by which value actually reaches a "recipient" in the current architecture, and the SOW's top-line objective and Deliverable 3's success criterion both hinge on "the same amount delivered at the end." With the recipient flow and status tracker now built, this is the only thing left standing between the current codebase and a reviewer watching a transfer actually settle.

2. **No anchor relationship, on either side of the corridor, has been confirmed in writing.** (`CORRIDOR_VERIFICATION.md`, entirely template) Critical because it invalidates Deliverable 1 outright and means every downstream claim about "the EUR/TRY corridor" is currently aspirational — the app is, and can only be, exercised against a generic Stellar demo anchor that does not support EUR or TRY.

3. **No refund mechanism exists, and the failure matrix has one structurally untestable row.** (`grep -rn "refund"` → one string literal, no logic; Failure Matrix, §3) Critical because "every path ending in a clean refund" is an explicit, repeated SOW requirement (both in the Objective and Deliverable 2), and the current failure matrix has no path that ends in anything other than a displayed error message. Invalid-IBAN client-side detection is now real (`lib/iban.ts`), but the app-level `invalid_recipient_details` error is still only reachable via a regex match on the anchor's free-text rejection, not a real anchor-side rejection of a well-formed IBAN.

4. **No self-hosted or otherwise controlled anchor test environment.** All SEP-31 testing depends entirely on the public reference anchor `testanchor.stellar.org`, whose SEP-31 `fields` configuration gap (item 1) Ferry has no ability to diagnose or fix from its own side — every retest is a bet on someone else's demo server, not a controlled experiment. This blocks confirming whether the SEP-31 gap is a Ferry-side integration bug or purely an anchor-side config issue.

5. **Zero automated tests or monitoring/alerting.** (confirmed via repository-wide grep — no `test` script, no `*.test.*`/`*.spec.*` files, no matches for `monitor|alerting|sentry|datadog`) Critical because Deliverable 2's own success criterion cites "test suite output" as evidence — there is still no test suite to produce output from. (Structured logging and a session-scoped audit trail are no longer gaps — see §3 — this item now covers only tests and monitoring.)

6. **Mainnet Readiness Pack is still a template, not a completed pack.** (`MAINNET_READINESS.md`, header explicitly labeled "TEMPLATE") Lower urgency than the above since it's a documentation deliverable rather than a code gap, but it remains genuinely incomplete: alerting thresholds, confirmed refund SLAs, and the business/legal go-live checklist are all still unfilled `[ ]` items, several of which depend on data that items 2 and 3 above would need to produce first.

---

## 6. Remediation Roadmap

Sequenced to respect dependency order (corridor/anchor facts block realistic testing of the money-movement path; the money-movement path blocks a truthful demo; tests and logging can proceed in parallel with everything else).

**Week 1 — Corridor reality check (unblocks everything else)**
1. Contact candidate EUR-side and TRY-side anchors; obtain written SEP-38/31/12/24 support confirmation and provision either sandbox credentials or a jointly-configured Testnet instance that actually supports EUR/TRY (`CORRIDOR_VERIFICATION.md` §1–§2 exists to receive this data — fill it, don't replace it).
2. Pull dated, sourced quotes from Western Union, Wise, and one traditional bank for a fixed EUR amount on a fixed day; replace `COST_BASELINE.md`'s illustrative table with measured figures.
3. Write and file the go/no-go decision document based on (1) and (2), before further engineering spend on a corridor that may not be viable.

**Week 2 — Close the SEP-31 completion gap and build the refund/failure-matrix path**
*(The recipient flow originally planned for this week is done — `app/claim/[id]/page.tsx` — so this week is now entirely about SEP-31 and refunds.)*
4. **Stand up a local, self-hosted Stellar Anchor Platform instance** (the official reference implementation, run via its Docker Compose setup) configured with a real SEP-31 `fields` definition for at least one asset. This is the concrete recommended path to unblock item 1 in §5: the public `testanchor.stellar.org` SEP-31 rejection is a server-side configuration gap on an anchor Ferry doesn't control and can't fix directly — a self-hosted instance gives Ferry an anchor it *can* fix, which both resolves the immediate testing blocker and, as a side effect, proves out whether Ferry's own SEP-31 request-building code is correct in isolation from the public anchor's specific misconfiguration.
5. Once SEP-31 creation succeeds against the local anchor, re-verify it against `testanchor.stellar.org` periodically — the public anchor's config may change — but stop treating it as the primary test target.
6. Implement actual refund handling: at minimum, detect an anchor-reported `refunded`/`error` status and surface a dedicated, designed refund-status screen (extending `StatusTracker.tsx`'s `FlowErrorType` union) with whatever refund reference the anchor provides. Close the remaining failure-matrix gap by wiring a real anchor-side rejection of a well-formed (not just malformed) IBAN into a reproducible test case, now that the local anchor from item 4 makes that controllable.

**Week 3 — Remaining operational hardening**
*(Idempotency, retries, structured logging, and a session-scoped audit trail are done — `lib/idempotency.ts`, `lib/stellar/anchorFetch.ts`, `lib/logger.ts`, `lib/auditTrail.ts` — so this week is narrower than originally scoped.)*
7. Make the audit trail durable: swap `lib/auditTrail.ts`'s in-memory `Map` for a real datastore (even a simple SQLite/Postgres table keyed by transfer id) so history survives a restart and is shareable across instances — the module's own docstring already flags this as the next step.
8. Stand up an automated test suite: unit tests for `lib/stellar/*` (mockable, since every anchor call goes through the shared `anchorFetch`/`assertAnchorOk` choke point), and at least a smoke-level integration test that runs the live Testnet flow already proven manually in `TESTNET_HASHES.md` — including, once Week 2 lands, a real SEP-31 completion test against the local anchor — so "test suite output" becomes real evidence instead of a manual transcript.
9. Wire up basic monitoring/alerting (even a simple uptime check plus error-rate alerting on the rate-limiter's rejection count and the `AnchorError` code distribution now emitted by `lib/logger.ts`).

**Week 4 — Demo, error-boundary polish, and the Mainnet readiness pack**
10. Add a root `app/error.tsx` React error boundary so an unanticipated exception has a designed screen rather than the framework default.
11. Record the end-to-end demo required by Deliverable 3, once Week 2 makes an actual settled transfer possible to show — this can now use the recipient claim flow and status tracker, both already built.
12. Convert `MAINNET_READINESS.md` from template to completed pack: fill in the operational decisions (`[ ]` items) that don't depend on anchor data, and close out the remainder once Week 1's anchor relationships produce real refund SLAs, escalation contacts, and pilot terms to record.

---

*This assessment is based on a direct reading of the repository as of the current commit — every ✅/⚠️/❌ above is tied to a specific file, line range, or grep result cited inline, not to a general impression of the codebase.*
