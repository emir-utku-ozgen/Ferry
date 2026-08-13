# Ferry — EUR → TRY Corridor Verification

> **⚠️ TEMPLATE — NOT YET COMPLETED WITH REAL DATA.**
> This document is a structured template for recording genuine anchor outreach and corridor verification. Every bracketed `[ ]` field below must be filled in from an actual conversation, signed agreement, or the anchor's own published `stellar.toml` / `/info` responses — **not invented**. As of this writing, Ferry's codebase integrates only with `testanchor.stellar.org`, the public Stellar reference/demo anchor, which does not support EUR or TRY (confirmed live: `sell_asset not found` on both — see `TESTNET_HASHES.md`). No EUR→TRY anchor relationship currently exists in the codebase or, to this document's author's knowledge, has been established. Submitting this template as-is, with placeholders unfilled, as evidence of confirmed anchor relationships would misrepresent the project's actual state — please complete it with real information before it leaves draft status.

---

## 1. Candidate Anchors — EUR Sending Side

| Field | Value |
|---|---|
| Anchor legal name | `[ ]` |
| Anchor domain (`stellar.toml` host) | `[ ]` |
| Regulatory status (license type, jurisdiction, license number) | `[ ]` |
| SEP-10 / SEP-24 / SEP-31 / SEP-38 support confirmed via | `[ ]` (e.g. "reviewed their `stellar.toml` on `[date]`" or "confirmed on a call with `[contact]` on `[date]`") |
| Point of contact | `[ ]` |
| Date of first outreach | `[ ]` |
| Date of confirmation (if any) | `[ ]` |
| Status | `[ ]` — Not contacted / Outreach sent / In discussion / Terms agreed / Signed |

## 2. Candidate Anchors — TRY Receiving Side

| Field | Value |
|---|---|
| Anchor legal name | `[ ]` |
| Anchor domain (`stellar.toml` host) | `[ ]` |
| Regulatory status (BDDK/MASAK registration or equivalent, if applicable) | `[ ]` |
| SEP-31 `DIRECT_PAYMENT_SERVER` confirmed reachable | `[ ]` |
| SEP-12 KYC field requirements reviewed (`GET /customer`) | `[ ]` |
| Point of contact | `[ ]` |
| Date of first outreach | `[ ]` |
| Date of confirmation (if any) | `[ ]` |
| Status | `[ ]` |

## 3. Production Parameters (to be confirmed by each anchor, in writing)

| Parameter | Sending anchor (EUR) | Receiving anchor (TRY) |
|---|---|---|
| Minimum transaction amount | `[ ]` | `[ ]` |
| Maximum transaction amount (per tx) | `[ ]` | `[ ]` |
| Maximum transaction amount (daily/monthly, if tiered by KYC level) | `[ ]` | `[ ]` |
| Fee structure (flat, %, or both) | `[ ]` | `[ ]` |
| Typical FX spread over mid-market | `[ ]` | `[ ]` |
| SEP-38 quote validity window (`expires_at` typical duration) | `[ ]` | `[ ]` |
| Refund policy: trigger conditions | `[ ]` | `[ ]` |
| Refund policy: SLA (time to refund) | `[ ]` | `[ ]` |
| Refund policy: who bears FX loss on a reversed transaction | `[ ]` | `[ ]` |
| Settlement time (fiat-in → Stellar leg) | `[ ]` | `[ ]` |
| Settlement time (Stellar leg → fiat-out) | `[ ]` | `[ ]` |
| SEP-12 fields required at minimum KYC tier | `[ ]` | `[ ]` |

## 4. Pilot Terms

| Term | Value |
|---|---|
| Pilot duration | `[ ]` |
| Pilot transaction volume cap | `[ ]` |
| Pilot fee arrangement (waived / discounted / standard) | `[ ]` |
| Success criteria for moving from pilot to production | `[ ]` |
| Liability / indemnification terms during pilot | `[ ]` |
| Data handling agreement reference (KYC data stays with anchor per Ferry's non-custodial architecture — confirm anchor's own data retention policy) | `[ ]` |

## 5. Verification Method (once real data exists)

Every parameter above that maps to a machine-readable anchor field should be verified two ways, both cited here with a date:
1. **Programmatically**, against the anchor's own `stellar.toml` and `GET /info` responses (SEP-1, SEP-24 `/info`, SEP-31 `/info`, SEP-38 `/info`) — the same way `TESTNET_HASHES.md` was produced, by actually calling the endpoints and recording the response.
2. **Contractually**, against the signed pilot agreement or written confirmation from the anchor's business contact, for anything not exposed in a public endpoint (refund SLA, liability terms, pilot pricing).

---

*This template mirrors the structure `TESTNET_HASHES.md` uses for technical evidence: real, dated, sourced data only. Replace every `[ ]` before this document is used as SOW evidence.*
