# Ferry — SOW Compliance & Gap Assessment

**Document type:** SOW compliance assessment
**Scope:** Ferry remittance orchestration application — Next.js 16 (App Router) / TypeScript / Tailwind CSS, `@stellar/stellar-sdk` ^15.1.0, `@stellar/freighter-api` ^6.0.1. No test runner, no database, no CI configuration present in the repository (verified: `package.json` has no `test` script and no test-framework dependency; no `*.test.*`/`*.spec.*` files; no `.github/workflows`).
**Reference:** Instawards SOW, 30-Day Scoped Engagement

---

## 1. Executive Summary

Ferry's protocol-orchestration core — the actual SEP-10, SEP-38, SEP-12, and SEP-24 request/response plumbing — is real, live-tested against Stellar Testnet and the public reference anchor (`testanchor.stellar.org`), and reasonably well-engineered: typed error handling, a 10-second timeout on every anchor call, per-IP rate limiting, and a domain allowlist are all genuinely implemented and verifiable in the code cited below. The sender-facing UI for Deliverable 3 is substantially built: `components/QuoteCalculator.tsx` shows the exact net TRY amount before locking a quote, and `components/StatusTracker.tsx` provides live step tracking with dedicated error screens for several failure modes. This is the strongest part of the codebase relative to the SOW.

Everything else has significant, evidenced gaps. **Deliverable 1 is essentially unmet**: no anchor has confirmed EUR/TRY support in writing (`CORRIDOR_VERIFICATION.md` is an explicitly-labeled template with every field blank), the cost baseline is illustrative market knowledge rather than measured same-day quotes, and no go/no-go decision document exists anywhere in the repo. **Deliverable 2 is partially met**: SEP-31 transaction creation has never once succeeded against the configured anchor in any test run on record (`TESTNET_HASHES.md` §7 — anchor returns `"Asset [USDC] has no fields definition"` on every attempt), there is no idempotency mechanism, no retry logic, no automated test suite of any kind, no structured logging, no persisted audit trail, and no monitoring/alerting. **Deliverable 3 is partially met**: there is no distinct recipient-facing link or page at all — `app/` contains exactly one route (`app/page.tsx`) plus API routes, so "recipient opens a link, enters an IBAN" as a separate flow does not exist; the KYC form that does exist has no IBAN-specific field or format validation; and no recorded demo video is present in the repository or referenced anywhere in it.

The compounding effect: because SEP-31 (the only implemented path that actually moves value between anchors) has never completed successfully, **Deliverable 3's own success criterion — "the same amount delivered at the end" — cannot currently be demonstrated end-to-end**, regardless of how complete the surrounding UI is. This is the central fact the rest of this document explains.

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

✅ SEP-12 relay implemented and live-verified. ⚠️ Not a "hosted screen" — it's a modal rendered inside Ferry's own page, and it is filled out by whoever holds the sender's session, not by a separate recipient.
- `lib/stellar/sep12.ts`: `getCustomerInfo()` (line 47), `submitCustomerInfo()` (line 76), `deleteCustomerInfo()` (line 65) — full GET/PUT/DELETE proxy to the anchor's `KYC_SERVER`.
- `app/api/sep12/customer/route.ts` exposes all three as rate-limited routes.
- `components/KycModal.tsx`: dynamically renders a form from the anchor's own required-field list (lines 70–72, 106–120), with a "Bank / IBAN details" section (line 115) built from `BANK_FIELD_ORDER = ["bank_name", "bank_account_number", "bank_account_type", "bank_number"]` (line 22).
- **This is not the hosted-screen flow the SOW describes.** The SOW says: *"Recipient opens a link, enters an IBAN, completes identity verification on the anchor's hosted screen."* In the actual code, `KycModal` is opened via `onOpenKyc` from `TransferPanel.tsx` line 471–477, inside the same browser session as the connected sender wallet — there is no distinct recipient URL. Confirmed by the full route inventory: `app/` contains only `app/page.tsx`, `app/layout.tsx`, and `app/api/**` — **no `app/recipient/[id]/page.tsx` or equivalent exists.** The KYC screen itself is Ferry's own React modal, not an anchor-hosted page opened in a new tab (contrast with SEP-24 in `TransferPanel.tsx` line 251, `window.open(result.url, ...)`, which *is* a genuine anchor-hosted handoff).
- ❌ **No IBAN-specific field or validation exists anywhere.** `components/KycModal.tsx`'s `FieldInput` (lines 142–188) renders `bank_account_number` as a generic `<input type="text">` (line 178) with no pattern, no format check, no client-side validation of any kind. Confirmed by `grep -rni "iban"` returning only comments and UI labels, never a validator function.
- SEP-24's hosted handoff *is* a genuine anchor-hosted screen: `lib/stellar/sep24.ts` `initInteractiveDeposit`/`initInteractiveWithdrawal` (lines 60–86) return the anchor's own `url`, opened via `window.open()` in `TransferPanel.tsx` line 251 — this part of the "no identity document reaches our servers" claim is accurate for the SEP-24 path.

### SEP-31 Transfer Creation

⚠️ **Implemented but never observed to succeed.**
- `lib/stellar/sep31.ts`: `createSep31Transaction()` (line 54), `getSep31Transaction()` (line 77), `getSep31Info()` (line 46).
- `app/api/sep31/transactions/route.ts` exposes POST (create) and GET (status lookup), both rate-limited.
- `components/TransferPanel.tsx` `Sep31Panel.send()` (lines 384–415) calls this with the locked quote's `id` as `quote_id` (line 402).
- ❌ **Every recorded attempt to create a SEP-31 transaction against the configured anchor fails** with `HTTP 400 {"error":"Asset [USDC] has no fields definition"}` (`TESTNET_HASHES.md` §7), reproduced independently across multiple test accounts with and without completed SEP-12 KYC. This means the `result` success-path UI in `TransferPanel.tsx` lines 496–511 (showing `stellar_account_id` / `stellar_memo`) has no known instance of ever having rendered with real data — it is implemented but functionally unverified.

### Idempotent State Machine, Retry/Timeout Handling

❌ **No idempotency. ❌ No retries. ✅ Timeouts only.**
- **Timeouts:** genuinely implemented. `lib/stellar/anchorFetch.ts` line 12 attaches `AbortSignal.timeout(ANCHOR_TIMEOUT_MS)` (10,000ms, `lib/stellar/anchorError.ts` line 11) to every anchor-facing `fetch()`; `lib/stellar/toml.ts` line 35 passes the same bound to the SDK's TOML resolver.
- **Retries:** ❌ absent. `grep -rni "retry\|retries"` across the codebase matches only the `Retry-After` HTTP header text in `lib/rateLimit.ts` and a code comment in `toml.ts` about *not* caching failed lookups so a *future manual request* can retry — there is no automated retry-with-backoff anywhere. `lib/stellar/anchorFetch.ts` makes exactly one attempt per call.
- **Idempotency:** ❌ absent entirely. `grep -rni "idempot"` across the full codebase returns zero matches. No idempotency key is generated or sent on any SEP-24/SEP-31 transaction-creation call (`lib/stellar/sep24.ts` `postInteractive`, `lib/stellar/sep31.ts` `createSep31Transaction`) — a network failure after the anchor received but before Ferry received the response would have no protection against a duplicate transaction on retry, because there is no retry logic in the first place *and* no dedup key if a caller retried manually.
- **State machine:** ❌ no formal state machine exists. The transfer's state (`sep10Token`, `lockedQuote`, `kycStatus`, `transferStatus`, `flowError`) is five independent `useState` calls in `app/page.tsx` (lines 16–23), updated imperatively by different components calling different setter props. There is no reducer, no explicit state graph, and no persistence — a page refresh loses all transfer state (`sep10Token` is explicitly documented in `GAP_ANALYSIS.md`'s predecessor security document as "held only in in-memory React state... lost on refresh").

### Failure Matrix

The SOW requires: *"Complete failure matrix implemented and tested: anchor rejection, failed KYC, invalid IBAN, expired quote — every path ending in a clean refund."*

| Failure mode | Implemented? | Tested? | Ends in refund? |
|---|---|---|---|
| Anchor rejection | ✅ `FlowErrorType: "anchor_rejected"`, `StatusTracker.tsx` lines 42–45 | ✅ Real, reproduced (`TESTNET_HASHES.md` §7) | ❌ No refund logic exists — see below |
| Failed KYC | ✅ `FlowErrorType: "kyc_rejected"`, `StatusTracker.tsx` lines 50–53 | ❌ Attempted live with deliberately malformed data; the reference anchor performed no validation and returned `ACCEPTED` regardless (`TESTNET_HASHES.md`, "Failure scenarios... not genuinely reproducible" table) | ❌ No refund logic exists |
| Invalid IBAN | ⚠️ `FlowErrorType: "invalid_recipient_details"` exists (`StatusTracker.tsx` lines 46–49) but is reached only by regex-matching the anchor's free-text rejection message for the words `bank|iban|account.number|routing` (`TransferPanel.tsx` line 65) — **there is no IBAN validator that could itself produce this error** | ❌ Not reproducible — no IBAN validation exists client-side or (as tested) anchor-side | ❌ No refund logic exists |
| Expired quote | ✅ Client-side block implemented (`QuoteCalculator.tsx` lines 226–236, `TransferPanel.tsx` lines 384–389) | ⚠️ Client-side block verified; anchor-side rejection of an expired `quote_id` never observed (blocked by the SEP-31 asset-config error first) | ❌ No refund logic — not applicable since no submission is allowed to reach the anchor |
| **Refund (all paths)** | ❌ **Not implemented at all** | ❌ | — |

**On refunds specifically:** `grep -rn "refund" --include="*.tsx" --include="*.ts"` across the entire codebase returns exactly one match: the string literal `"refunded"` in `TransferPanel.tsx` line 34, as one entry in a `Set` of SEP-24 terminal statuses that merely stops the polling loop (line 225). There is no code path that initiates a refund, tracks a refund's progress, or displays refund-specific information to the user beyond generically showing whatever status string the anchor reports. **"Every path ending in a clean refund" is not met by any path**, because Ferry has no refund mechanism to end in.

### Logging, Audit Trail, Automated Tests, Monitoring

❌ **All four sub-requirements are unmet.**
- **Structured logs:** ❌ absent. `grep -rn "console\."` across all `.ts`/`.tsx` files in the repository returns zero matches — there is no logging statement of any kind, structured or otherwise, anywhere in the codebase.
- **Full audit trail per transfer:** ❌ absent. There is no database, no file-based log, no external logging service integration (`grep -rni "database|postgres|sqlite|prisma|drizzle|mongodb|supabase"` returns nothing). All transfer state lives in React `useState` in the browser tab and is discarded on refresh or navigation — nothing is durably recorded anywhere, so no audit trail can be reconstructed after the fact.
- **Automated tests:** ❌ absent. `package.json` has no `test` script (only `dev`, `build`, `start`, `lint`). No test-framework dependency (`jest`, `vitest`, `playwright`, `@testing-library/*`) appears in `dependencies` or `devDependencies`. No file matching `*.test.*` or `*.spec.*` exists anywhere in the repository.
- **Monitoring and alerting:** ❌ absent. `grep -rni "monitor|alerting|sentry|datadog|logtail|pino|winston"` across all source and config files returns zero matches. No health-check endpoint, no error-tracking SDK, no uptime/alerting configuration exists.

**Deliverable 2 status: partially met.** The four SEP integrations are real, and SEP-10/38/12 are genuinely demonstrable end-to-end. Timeout handling and typed error codes are solid engineering. But SEP-31 — the deliverable's own money-movement step — has never completed, and every operational requirement in this deliverable's second half (idempotency, retries, refunds, logging, audit trail, tests, monitoring) is either absent or, at best, half-implemented with the untested half being the one that matters (anchor-side quote expiry, IBAN rejection).

---

## 4. Deliverable 3 — Sender/Recipient Web Experience + Mainnet Readiness Pack

### Sender: Net TRY Amount Display Prior to Payment

✅ **Implemented.** `components/QuoteCalculator.tsx` line 190 ("Recipient nets ≈ {indicative.buy_amount}...") for the unauthenticated preview, and line 217 ("Net {lockedQuote.buy_amount}...") for the locked, guaranteed figure, both rendered before any SEP-24/31 submission is possible. Fee breakdown shown via the `FeeBreakdown` component (lines 40–53), sourced from the anchor's own SEP-38 `fee` object.

### Sender: Live Status Tracking UI

✅ **Implemented.** `components/StatusTracker.tsx` renders a 4-step tracker (`STEPS`, lines 20–25: Quote Locked → KYC Verified → Deposit Initiated → Settled in Lira), with `currentStepIndex()` (lines 56–62) deriving progress from real app state (`hasQuote`, `kycStatus`, `transferStatus`). `TransferPanel.tsx`'s SEP-24 polling loop (lines 218–233) updates `transferStatus` on a 4-second interval via `onTransferStatusChange`, which flows into the tracker live.
- ⚠️ Note: the "Settled in Lira" step (index 3, `SETTLED_STATUSES = new Set(["completed"])`, `StatusTracker.tsx` line 27) has never been reached in any recorded test, since it depends on either a human completing the anchor's hosted SEP-24 form (not automatable) or a successful SEP-31 transaction (never achieved — see Deliverable 2).

### Recipient: Link Handling, IBAN Input, Hosted KYC Flow

❌ **Missing — no recipient-specific flow exists.**
- No dedicated recipient route/page/link exists in the codebase. Full inventory of `app/`: `app/page.tsx`, `app/layout.tsx`, and `app/api/**` route handlers only. There is no shareable transaction link, no recipient-scoped token/URL, and no distinct recipient UI state anywhere.
- The KYC step that does exist (`components/KycModal.tsx`) is opened by the sender's own session (`TransferPanel.tsx` line 471–477) and is Ferry's own in-app modal — not the anchor's hosted screen. This directly contradicts the SOW wording ("completes identity verification on the anchor's hosted screen") for the SEP-12 path specifically, even though the SEP-24 path genuinely does hand off to the anchor's hosted UI via `window.open()`.
- No IBAN input field exists (see Deliverable 2, SEP-12/24 section) — `bank_account_number` is present only as a generic free-text field with no IBAN-specific label, mask, or validation.

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

**Deliverable 3 status: partially met.** The sender-side experience (amount shown before paying, live status, several designed error screens) is real and matches the SOW's language closely. The recipient-side experience as specified — a distinct link, an IBAN field, an anchor-hosted identity check — does not exist. No demo recording exists. The readiness pack is a well-organized checklist, not a completed pack.

---

## 5. Critical Gaps (Priority Order)

1. **SEP-31 transaction creation has never succeeded against the configured anchor.** (`lib/stellar/sep31.ts`, `components/TransferPanel.tsx` `Sep31Panel`, evidenced in `TESTNET_HASHES.md` §7) This is critical because it is the one mechanism by which value actually reaches a "recipient" in the current architecture, and the SOW's top-line objective and Deliverable 3's success criterion both hinge on "the same amount delivered at the end." Every other gap in this document is secondary to the fact that a reviewer cannot currently complete a transfer that settles.

2. **No recipient-facing flow exists at all.** (`app/` route inventory — only `app/page.tsx` and `app/api/**`) Critical because the SOW's Deliverable 3 explicitly specifies a *separate* recipient experience ("recipient opens a link, enters an IBAN, completes identity verification on the anchor's hosted screen"), and this is not a UI-polish gap — the underlying routing/architecture to support a second party's access doesn't exist yet, which is a structural change, not a copy change.

3. **No anchor relationship, on either side of the corridor, has been confirmed in writing.** (`CORRIDOR_VERIFICATION.md`, entirely template) Critical because it invalidates Deliverable 1 outright and means every downstream claim about "the EUR/TRY corridor" is currently aspirational — the app is, and can only be, exercised against a generic Stellar demo anchor that does not support EUR or TRY.

4. **Zero automated tests, structured logging, audit trail, or monitoring.** (confirmed via repository-wide grep — no matches for `console.`, `test` script, `*.test.*`, `monitor|alerting|sentry`, or any database dependency) Critical because Deliverable 2's own success criterion is "every listed flow is reproducible... test suite output" as evidence — there is no test suite to produce output from, and no audit trail to demonstrate a transfer's history after the fact.

5. **No refund mechanism exists anywhere in the codebase.** (`grep -rn "refund"` → one string literal, no logic) Critical because "every path ending in a clean refund" is an explicit, repeated SOW requirement (both in the Objective and Deliverable 2), and the current failure matrix has no path that ends in anything other than a displayed error message.

---

## 6. Remediation Roadmap

Sequenced to respect dependency order (corridor/anchor facts block realistic testing of the money-movement path; the money-movement path blocks a truthful demo; tests and logging can proceed in parallel with everything else).

**Week 1 — Corridor reality check (unblocks everything else)**
1. Contact candidate EUR-side and TRY-side anchors; obtain written SEP-38/31/12/24 support confirmation and provision either sandbox credentials or a jointly-configured Testnet instance that actually supports EUR/TRY (`CORRIDOR_VERIFICATION.md` §1–§2 exists to receive this data — fill it, don't replace it).
2. Pull dated, sourced quotes from Western Union, Wise, and one traditional bank for a fixed EUR amount on a fixed day; replace `COST_BASELINE.md`'s illustrative table with measured figures.
3. Write and file the go/no-go decision document based on (1) and (2), before further engineering spend on a corridor that may not be viable.

**Week 2 — Close the SEP-31 completion gap and add the missing recipient flow**
4. Diagnose and resolve (or replace the test anchor with one that resolves) the `"Asset [USDC] has no fields definition"` SEP-31 rejection — this blocks every downstream demo and test.
5. Design and build a genuine recipient-facing route (e.g. `app/r/[transactionId]/page.tsx`) that a sender can share, with its own IBAN-labeled input and format validation, and that hands off to the anchor's hosted SEP-12/24 screen the way `TransferPanel.tsx`'s existing `window.open(result.url, ...)` pattern already does for SEP-24 deposits — reuse that pattern rather than the current in-app `KycModal`.
6. Implement actual refund handling: at minimum, detect an anchor-reported `refunded`/`error` status and surface a dedicated, designed refund-status screen (extending `StatusTracker.tsx`'s `FlowErrorType` union) with whatever refund reference the anchor provides.

**Week 3 — Operational hardening required by Deliverable 2**
7. Add structured logging (even a minimal `pino`/`console.log` with a correlation ID per transfer) at every orchestrator route, plus a durable audit-trail store (even a simple SQLite/Postgres table keyed by transfer id) — current state is fully ephemeral and unauditable.
8. Add an idempotency key to every state-mutating anchor call (`initInteractiveDeposit`, `initInteractiveWithdrawal`, `createSep31Transaction`) and a bounded retry-with-backoff for idempotent GET calls, per the already-documented (but unimplemented) plan in the prior architectural gap analysis.
9. Stand up an automated test suite: unit tests for `lib/stellar/*` (mockable, since every anchor call goes through the shared `anchorFetch`/`assertAnchorOk` choke point), and at least a smoke-level integration test that runs the live Testnet flow already proven manually in `TESTNET_HASHES.md`, so "test suite output" becomes real evidence instead of a manual transcript.
10. Wire up basic monitoring/alerting (even a simple uptime check plus error-rate alerting on the rate-limiter's rejection count and the `AnchorError` code distribution).

**Week 4 — Demo, error-boundary polish, and the Mainnet readiness pack**
11. Add a root `app/error.tsx` React error boundary so an unanticipated exception has a designed screen rather than the framework default.
12. Record the end-to-end demo required by Deliverable 3, once steps 4–6 make an actual settled transfer possible to show.
13. Convert `MAINNET_READINESS.md` from template to completed pack: fill in the operational decisions (`[ ]` items) that don't depend on anchor data, and close out the remainder once Week 1's anchor relationships produce real refund SLAs, escalation contacts, and pilot terms to record.

---

*This assessment is based on a direct reading of the repository as of the current commit — every ✅/⚠️/❌ above is tied to a specific file, line range, or grep result cited inline, not to a general impression of the codebase.*
