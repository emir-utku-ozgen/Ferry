# Ferry — Go-Live Checklist

**Document type:** Mainnet Readiness Pack, part 4 of 4 (SOW Deliverable 3). See also `RUNBOOK.md`, `REFUND_AND_INCIDENT_PROCEDURES.md`, `KEY_MANAGEMENT.md` in this directory.
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
- [ ] `NEXT_PUBLIC_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_HORIZON_URL` / `NEXT_PUBLIC_ANCHOR_DOMAIN` switched to Mainnet values via a reviewed config change, not a silent default — see `RUNBOOK.md` §2.1 for the exact procedure
- [ ] `ANCHOR_ALLOWLIST` contains only the contracted production anchor domain(s); confirm the Testnet default (`testanchor.stellar.org`) is not present
- [ ] `lib/rateLimit.ts`, `lib/idempotency.ts`, and `lib/auditTrail.ts` migrated to a shared store before running more than one instance concurrently — each is currently process-local in-memory (flagged in each module's own docstring)
- [ ] SEP-31 transaction creation confirmed successful against the actual contracted anchor at least once — as of this writing it has never succeeded against `testanchor.stellar.org` (`GAP_ANALYSIS.md` §3, §5 item 1); a different anchor's configuration may or may not share this specific gap
- [ ] Recipient claim link's session-token limitation resolved — currently reuses the sender's own SEP-10 token in the share-link query string (`KEY_MANAGEMENT.md` §2)
- [ ] Session architecture migrated to an `HttpOnly`-cookie / BFF pattern, if the XSS-exposure risk of the current in-memory JWT is unacceptable at Mainnet transaction values (`KEY_MANAGEMENT.md` §4)
- [ ] Automated test suite in place — none exists today (`package.json` has no `test` script; no `*.test.*`/`*.spec.*` files anywhere in the repository)
- [ ] Monitoring/alerting wired to the data `lib/logger.ts` now emits — no alerting system consumes it yet
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

- [ ] End-to-end recorded demo showing a transfer reach the status tracker's final "Completed / Delivered" step. **Cannot be honestly recorded yet** — that step has never been reached in any test on record, because it depends on either a human completing an anchor's hosted SEP-24 form (not automatable) or a successful SEP-31 transaction (never achieved against the current Testnet anchor). Recording a walkthrough that stops short of this step would misrepresent the product; see `GAP_ANALYSIS.md` §4.

---

*This checklist rolls up `RUNBOOK.md`, `REFUND_AND_INCIDENT_PROCEDURES.md`, `KEY_MANAGEMENT.md`, and `GAP_ANALYSIS.md` into one pre-launch view. Re-check §1 against the codebase and re-issue this document whenever a checked/unchecked state changes — an item checked here should always be independently verifiable by the citation next to it, not taken on faith.*
