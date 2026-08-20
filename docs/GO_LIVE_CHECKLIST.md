# Ferry — Go-Live Checklist

**Document type:** Mainnet Readiness Pack, part 4 of 4 (SOW Deliverable 3). See also `RUNBOOK.md`, `REFUND_AND_INCIDENT_PROCEDURES.md`, `KEY_MANAGEMENT.md`, and `DEMO_SCRIPT.md` in this directory.
**Scope:** a single pre-flight checklist rolling up the application-layer state and the business/legal decisions tracked across the other three documents and `GAP_ANALYSIS.md`. Items are checked only when genuinely true against the current codebase or a real, dated decision — not aspirationally.

---

## 1. Application-layer (verifiable against this codebase)

- [x] SEP-10/12/24/31/38 orchestration implemented and live-tested against a public Testnet reference anchor (`GAP_ANALYSIS.md` §3; `TESTNET_HASHES.md`)
- [x] Recipient-facing claim route with client-side IBAN validation and a hosted SEP-12 KYC handoff (`app/claim/[id]/page.tsx`, `lib/iban.ts`)
- [x] Live status tracker labeled to the SOW's exact 4-step lifecycle (`components/StatusTracker.tsx`)
- [x] Designed error screens with an explicit clean-refund status for all 4 SOW failure scenarios (`components/StatusTracker.tsx`'s `ERROR_COPY`; see `REFUND_AND_INCIDENT_PROCEDURES.md` §2)
- [x] Idempotency keys on state-mutating anchor calls (`lib/idempotency.ts`, `lib/apiInstrumentation.ts`)
- [x] Retry-with-backoff on read-only anchor calls, scoped to connectivity failures only (`lib/stellar/anchorFetch.ts`)
- [x] Structured JSON logging on every instrumented route (`lib/logger.ts`)
- [x] Session-scoped audit trail per transfer (`lib/auditTrail.ts`, `GET /api/audit/[transferId]`)
- [x] Per-IP rate limiting and a server-side anchor domain allowlist (`lib/rateLimit.ts`, `lib/stellar/anchorAllowlist.ts`)
- [x] Idempotent transfer state machine — `lib/transferMachine.ts`, wired into `app/page.tsx`, replacing 5 independent `useState` calls with an explicit reducer and idempotent-transition guards (closes `GAP_ANALYSIS.md`'s P0-2)
- [x] Server-side SEP-38 quote-expiry enforcement — `mock-anchor/server.js`'s `POST /transactions` now rejects an expired `quote_id`; genuine anchor-side rejection captured in `TESTNET_HASHES.md` §9.4
- [x] SEP-31 settlement amount verification — the payment-matching poller now requires the cumulative amount received under a memo to cover the invoiced amount before marking a transaction `completed` (`mock-anchor/settlement.js`; closes the underpayment bug found in `TESTNET_HASHES.md` §8.4 — see `mock-anchor/settlement.test.js`)
- [x] Automated test suite in place — 56 tests total: `vitest` for the Next.js app (`lib/*.test.ts`, `components/TransferPanel.classifyTransferError.test.ts`) plus `node --test` for `mock-anchor/` (`mock-anchor/settlement.test.js`). `npm test` in each package.
- [x] Basic monitoring/alerting — `lib/monitoring.ts` tracks a failure-rate window fed by every instrumented route and every rate-limit rejection; `GET /api/health` reports current alert state
- [x] "Network switch is pure configuration" claim verified true — `components/WalletConnect.tsx` previously hardcoded the literal `"TESTNET"` string (would have broken a real Mainnet-configured Freighter session); now derives the expected network label from `NETWORK_PASSPHRASE`
- [x] Public Testnet deployment configuration documented — `RUNBOOK.md` §2.2 (Vercel for the app, Render/Railway for `mock-anchor/`, since it needs a persistent process for its in-memory state + background poller); `mock-anchor/server.js`'s `stellar.toml` now advertises the correct scheme (HTTPS off `localhost`) for a public host
- [ ] Public Testnet deployment actually live at a public URL — configuration above is ready, deployment itself not yet executed
- [ ] `NEXT_PUBLIC_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_HORIZON_URL` / `NEXT_PUBLIC_ANCHOR_DOMAIN` switched to Mainnet values via a reviewed config change, not a silent default — see `RUNBOOK.md` §2.1 for the exact procedure
- [ ] `ANCHOR_ALLOWLIST` contains only the contracted production anchor domain(s); confirm the Testnet default (`testanchor.stellar.org`) is not present
- [ ] `lib/rateLimit.ts`, `lib/idempotency.ts`, and `lib/auditTrail.ts` migrated to a shared store before running more than one instance concurrently — each is currently process-local in-memory (flagged in each module's own docstring)
- [ ] SEP-31 transaction creation confirmed successful against the actual contracted anchor at least once — as of this writing it has never succeeded against `testanchor.stellar.org` (`GAP_ANALYSIS.md` §3, §5 item 1); genuinely succeeds against Ferry's own mock anchor (`TESTNET_HASHES.md` §8.4, §9), which is not a substitute for a contracted anchor
- [ ] Recipient claim link's session-token limitation resolved — currently reuses the sender's own SEP-10 token in the share-link query string (`KEY_MANAGEMENT.md` §2)
- [ ] Session architecture migrated to an `HttpOnly`-cookie / BFF pattern, if the XSS-exposure risk of the current in-memory JWT is unacceptable at Mainnet transaction values (`KEY_MANAGEMENT.md` §4)
- [ ] Dependency supply chain reviewed (`@stellar/stellar-sdk`, `@stellar/freighter-api`) ahead of cutover
- [ ] Load test of rate-limit thresholds against the real contracted anchor's own published limits, once known

## 2. Business/legal (not trackable from code — requires real input)

- [ ] EUR-side anchor relationship signed (`CORRIDOR_VERIFICATION.md` §1)
- [ ] TRY-side anchor relationship signed (`CORRIDOR_VERIFICATION.md` §2)
- [ ] Production parameters (limits, fees, refund SLA) confirmed in writing (`CORRIDOR_VERIFICATION.md` §3)
- [ ] Pilot terms agreed (`CORRIDOR_VERIFICATION.md` §4)
- [ ] Go/no-go decision documented, based on the above (`GAP_ANALYSIS.md` §6, Week 1)
- [ ] Regulatory review completed for Ferry's own role — confirm "orchestrator, non-custodial" framing holds under the relevant jurisdiction's money-transmission definitions; this is a legal determination, not a technical one, and nothing in this codebase can satisfy it
- [ ] Terms of service / privacy policy published, reflecting the actual data flow (Ferry proxies but does not store KYC data — `KEY_MANAGEMENT.md` §2)
- [ ] Incident/refund contact information published to end users, once the escalation paths in `REFUND_AND_INCIDENT_PROCEDURES.md` §4.3 are decided
- [ ] Third-party security audit completed
- [ ] On-call rotation, alerting thresholds, and rollback procedure decided and documented (`RUNBOOK.md` §5)
- [ ] Key-management scope decision recorded explicitly, even if the answer is "not applicable" (`KEY_MANAGEMENT.md` §3)

## 3. Demo (blocked on §1's SEP-31 item until resolved)

- [x] Timed walkthrough script written — `docs/DEMO_SCRIPT.md`, budgeted to <10 minutes per the SOW's own evidence requirement, including a pre-recording checklist so the recording doesn't wait live on a faucet
- [ ] End-to-end recorded demo showing a transfer reach the status tracker's final "Completed / Delivered" step. **Can now be recorded against Ferry's own mock anchor** — `TESTNET_HASHES.md` §8.4 already reached `completed` once, live, with real hashes — but hasn't been re-recorded since this session's P0-1/P0-3 fixes; §9.6 explains the one open item (a fresh EURC-funded run to also demonstrate the corrected amount-verification path on camera, currently blocked on Testnet EURC acquisition). Recording against `testanchor.stellar.org` specifically still isn't possible (`GAP_ANALYSIS.md` §4).

---

*This checklist rolls up `RUNBOOK.md`, `REFUND_AND_INCIDENT_PROCEDURES.md`, `KEY_MANAGEMENT.md`, and `GAP_ANALYSIS.md` into one pre-launch view. Re-check §1 against the codebase and re-issue this document whenever a checked/unchecked state changes — an item checked here should always be independently verifiable by the citation next to it, not taken on faith.*
