# Ferry — Refund & Incident Procedures

**Document type:** Mainnet Readiness Pack, part 2 of 4 (SOW Deliverable 3). See also `RUNBOOK.md`, `KEY_MANAGEMENT.md`, `GO_LIVE_CHECKLIST.md` in this directory.
**Scope:** what "refund" means in Ferry's non-custodial architecture, the state workflow for each of the SOW's 4 named failure scenarios, and incident response procedures for the failure modes Ferry can actually detect.

---

## 1. The governing fact: Ferry cannot process a refund itself

Ferry holds no funds and no private keys at any point (`KEY_MANAGEMENT.md` §1) — every fiat and Stellar-asset movement happens directly between the end user and a licensed anchor. **There is no "Ferry balance" to refund from.** Any refund is necessarily the responsibility of whichever party — the sending anchor, the receiving anchor, or (for a SEP-24 hosted deposit) the anchor holding the deposited asset — actually has custody of the affected funds at the time of failure.

This makes "refund," for Ferry specifically, a question of two things:
1. **Did funds move at all before this failure?** If not, there is nothing to refund — the correct, honest status is "clean," not "refund pending."
2. **If funds did move, can Ferry detect and surface the anchor's own refund status?** Ferry cannot trigger a refund, but it can (and now does, for SEP-24) read and display the refund data the anchor itself reports.

## 2. Failure Matrix: the 4 SOW-named scenarios

The SOW requires a complete failure matrix — anchor rejection, failed KYC, invalid IBAN, expired quote — with every path ending in a clean refund. Each is implemented as a designed error screen in `components/StatusTracker.tsx` (`FlowErrorType`, `ERROR_COPY`), reachable from a real, reproducible trigger in the app, not a hypothetical.

| # | Failure mode | Trigger (real, reproducible) | Refund state | Why |
|---|---|---|---|---|
| 1 | **Expired quote** | `Sep31Panel.send()` checks `quoteExpired` before calling the anchor at all (`components/TransferPanel.tsx`) | ✅ Clean — nothing sent | Client-side block fires *before* any anchor request goes out. |
| 2 | **Anchor rejection** | The anchor's `POST /transactions` (SEP-31 create) returns a non-2xx, caught and classified by `classifyTransferError()` (`components/TransferPanel.tsx`) | ✅ Clean — nothing sent | Ferry only displays the anchor's deposit instructions (`stellar_account_id` / `stellar_memo`) *after* this call succeeds. A rejected create call means that point was never reached — no Stellar payment was ever sent by the user. |
| 3 | **Invalid IBAN** | Two real triggers: (a) `lib/iban.ts`'s ISO 13616 + mod-97 validator rejects the value client-side in `components/KycModal.tsx`'s `submit()`, before any submission; (b) the anchor's own free-text rejection of a submitted SEP-31 request matches `/bank\|iban\|account.number\|routing/i` (`TransferPanel.tsx`'s `classifyTransferError()`) | ✅ Clean — nothing sent | Same reasoning as anchor rejection: both triggers occur before a transaction is created, let alone paid. |
| 4 | **Failed KYC** | SEP-12 customer status returns `REJECTED` after a submit in `components/KycModal.tsx` | ✅ Clean — nothing sent | Sending is gated on `kycStatus === "ACCEPTED"` (`Sep31Panel`) — a rejected KYC record can never reach the point where a transaction is created. |

Each screen (`ERROR_COPY[type]` in `components/StatusTracker.tsx`) renders three things: a plain-language title and hint, the anchor's raw error message (for anyone who needs the exact wire-level detail), and a distinct green "Clean refund status" panel stating explicitly why nothing needs to be refunded for that specific failure — not a generic "an error occurred" message. A "Dismiss and try again" action lets the user retry without reloading the page.

**Important scope note, stated plainly:** the "clean" claim above is a structural fact about Ferry's *current* SEP-31 orchestration model specifically — the actual Stellar payment for a SEP-31 transaction is a manual step the sender takes after Ferry displays the anchor's deposit address (Ferry doesn't broadcast that payment itself; see `GAP_ANALYSIS.md` §3, "Idempotent State Machine" section, and the roadmap's note on SEP-31 completion). If a future change makes Ferry send that payment automatically, or reroutes any of these 4 error types to fire *after* a payment is sent, this table and the corresponding `refundDetail` copy in `components/StatusTracker.tsx` must be revisited — the code comment directly above `ERROR_COPY` says so explicitly, so this doesn't silently drift out of sync with reality.

## 3. The one path where funds genuinely can move: SEP-24 hosted deposits

Unlike SEP-31, a SEP-24 hosted deposit involves the user actually paying the anchor (via its own hosted UI, opened with `window.open()` in `Sep24Panel`) *before* Ferry's polling loop can observe a terminal status. If that deposit subsequently fails, a real refund can be necessary — and SEP-24's own spec defines fields for exactly this (`refunded: boolean`, `refunds: { amount_refunded, amount_fee, payments: [...] }` on the transaction object).

`components/TransferPanel.tsx`'s `Sep24Panel` now surfaces this directly: when a polled transaction reports `refunded` or a `status` of `"refunded"`, the live-status card renders a dedicated "✓ Refunded by anchor" block with the refunded amount, anchor fee, and each individual refund payment's id — sourced entirely from the anchor's own response (`lib/stellar/client/sep24Client.ts`'s `Sep24Refunds`/`Sep24RefundPayment` types), never fabricated. If the anchor reports `refunded` without the `refunds` detail object, Ferry says so plainly ("didn't include refund payment details") rather than inventing numbers.

**Known gap, stated rather than hidden:** if a SEP-24 transaction instead terminates in a bare `"error"` status *without* `refunded: true`, Ferry has no way to confirm whether the anchor has, will, or won't refund it — that information simply isn't in the transaction object at that point. The UI does not claim a refund happened in that case; it shows the anchor's own status text and nothing more. Confirming and communicating fund status for that specific gap is a manual, anchor-side support interaction today (§4 below), not something Ferry's polling can resolve on its own.

## 4. Incident response

### 4.1 What Ferry can detect automatically

- Anchor timeouts and connectivity failures (`AnchorError` with code `ANCHOR_TIMEOUT` / `NETWORK_ERROR`, surfaced as HTTP `504`/`502`) — logged via `lib/logger.ts` with the failing route and anchor context.
- Anchor rejections (any non-2xx anchor response, code `ANCHOR_REJECTED`) — logged with the anchor's own HTTP status passed through.
- Rate-limit rejections against Ferry's own `/api/*` routes (`lib/rateLimit.ts`).
- The 4 named failure scenarios above, each logged and recorded to the session's audit trail (`lib/auditTrail.ts`) at the moment they occur.

### 4.2 What Ferry cannot detect automatically

- Whether an anchor has actually issued a refund for a SEP-24 deposit that ended in a bare `error` status (§3).
- Whether a SEP-31 transaction that a sender manually paid (outside Ferry's own flow — see §2's scope note) subsequently settled, failed, or was refunded — Ferry does not currently poll SEP-31 transaction status after creation.
- Anything about an anchor's internal fraud, compliance, or banking-rail failures that never surfaces through its SEP-24/31 transaction status API.

For all of these, resolution currently requires a human contacting the anchor directly — there is no automated reconciliation loop today.

### 4.3 Decisions needed before go-live

| Item | Owner | Decision |
|---|---|---|
| Confirmed refund SLA per contracted anchor | `[ ]` | See `CORRIDOR_VERIFICATION.md` §3 — not yet obtained |
| User-facing support channel for a stuck/failed transaction that Ferry itself cannot resolve (§4.2 cases) | `[ ]` | `[ ]` |
| Incident severity classification (what counts as SEV1 vs SEV2/3 — e.g. does "an anchor is down" rank differently from "Ferry itself is down"?) | `[ ]` | `[ ]` |
| Incident communication plan (status page, user notification method) | `[ ]` | `[ ]` |
| Post-incident review process | `[ ]` | `[ ]` |
| Escalation path to each contracted anchor's own support/incident line | `[ ]` | `[ ]` |
| Whether/how to add SEP-31 post-creation status polling, to close the §4.2 gap for that path (tracked as a roadmap item in `GAP_ANALYSIS.md` §6) | `[ ]` | `[ ]` |

---

*Sections 1–3 above describe real, currently-shipped behavior with file-level citations. Section 4.3 is the genuinely open part of this document — filling it in requires operational decisions this document cannot make on its own.*
