# Ferry — EUR → TRY Corridor Verification

> **⚠️ TEMPLATE — §1–§4 NOT YET COMPLETED WITH REAL ANCHOR DATA.**
> This document is a structured template for recording genuine anchor outreach and corridor verification. Every bracketed `[ ]` field in §1–§4 below must be filled in from an actual conversation, signed agreement, or a licensed anchor's own published `stellar.toml` / `/info` responses — **not invented**. No EUR→TRY *anchor relationship* currently exists, and submitting §1–§4 as-is, with placeholders unfilled, as evidence of confirmed anchor relationships would misrepresent the project's actual state.
>
> **What has changed:** Ferry's codebase no longer only integrates with `testanchor.stellar.org` (which never supported EUR or TRY at all — confirmed live, `sell_asset not found` on both, see `TESTNET_HASHES.md`). It now also represents the EUR leg with Circle's real EURC and the TRY leg with a self-issued mock anchor, **specifically so the corridor is testable end-to-end while §1–§4 remain open** — this is a technical testing capability, not a substitute for the anchor relationships §1–§4 describe. §5 below documents exactly what's real and what's simulated, with the same evidence standard as the rest of this document. Please complete §1–§4 with real anchor information before this document is used as SOW evidence of a confirmed corridor.

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

## 5. Current Technical Corridor Representation — EURC (real) + Mock TRY (simulated)

**This section exists to state plainly what Ferry's code actually talks to today, so nobody mistakes it for the confirmed anchor relationships §1–§4 are still waiting on.** Neither leg below is a licensed anchor relationship. Both are Testnet-only.

### 5.1 EUR leg — Circle's real EURC on Stellar Testnet

Ferry represents the EUR side of this corridor as **Circle's real EURC** — a genuine, widely-used Stellar-native asset, not a raw `iso4217:EUR` fiat code — because a sender actually holds and sends EURC on-chain, and no public Testnet anchor advertises `iso4217:EUR` support at all (confirmed: `testanchor.stellar.org`'s `GET /sep38/info` lists only `USD`/`CAD` as fiat assets).

| Field | Value |
|---|---|
| Asset code | `EURC` |
| Issuer (Stellar Testnet) | `GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO` |
| Verification method 1 | Circle's own developer documentation (`developers.circle.com/stablecoins/eurc-contract-addresses`) publishes this exact address as the Stellar Testnet EURC issuer. |
| Verification method 2 (independent, on-chain) | Queried directly against `https://horizon-testnet.stellar.org`: this account's `home_domain` is `circle.com`; the `EURC` asset it issues has ~2,500 authorized trustlines and ~7.2 billion units of authorized supply, and is wrapped by 38 separate Soroban contracts — consistent with a real, actively-used asset, not a same-named impersonator (Testnet asset codes are unauthenticated; anyone can issue an asset called `EURC`, so this on-chain corroboration matters, not just the docs citation). |
| Where it's used in code | `lib/stellar/config.ts`'s `EURC_ISSUER` constant; `components/QuoteCalculator.tsx`'s `SELL_ASSETS`; `components/TransferPanel.tsx`'s `SEP24_ASSETS` (as a settlement-asset option) |
| **This is real** | Real Circle-issued asset, real Testnet ledger, real transferable balance. `TESTNET_HASHES.md` §8.1 has a real, checkable trustline-setup transaction for it; §8.3 states plainly that the on-chain EURC *payment* leg specifically was not completed in that run (blocked by external Testnet-EURC acquisition constraints, not by anything in Ferry's code — see that section for exactly why) rather than overstating what was verified. |

### 5.2 TRY leg — Ferry's own mock anchor (`mock-anchor/`)

**No public TRY-issuing anchor exists on Stellar Testnet.** Rather than leave the TRY leg entirely untestable, Ferry ships a minimal, self-issued mock anchor — committed at `mock-anchor/` in this repository — that quotes and settles a Stellar asset it calls `TRY`. **This is explicitly not a real, fiat-backed Turkish Lira token, not a licensed anchor, and not affiliated with any bank.** It exists solely so the EUR(EURC)→TRY corridor has something runnable end-to-end on Testnet while §1–§4 above remain unfilled.

| Field | Value |
|---|---|
| Asset code | `TRY` |
| Issuer | Generated locally by whoever runs `mock-anchor/` (see its README) — the specific instance used for this repo's own verification run is recorded in `TESTNET_HASHES.md` §8.1 alongside that run's transaction hashes |
| What it actually implements | Minimal SEP-1 (`stellar.toml`), SEP-10 (auth), SEP-12 (mock, always-accept KYC), SEP-38 (quotes at a fixed, clearly-illustrative rate — not a live FX feed), and SEP-31 (transaction creation, with a background poller that detects the sender's real EURC payment and marks the transaction complete) |
| What it does **not** implement | SEP-24 (hosted deposit/withdrawal) — not needed for the SEP-31 corridor path. Real KYC, real banking rails, real refund handling, or any persistence — restarting the process forgets every customer/quote/transaction record, deliberately, same as it should for something explicitly not production infrastructure. |
| The "TRY payout" specifically | A real SEP-31 anchor pays out fiat via a bank wire — no Stellar transaction at all. Since this mock harness has no bank rail, it can *optionally* send a small demonstrative `TRY`-asset payment on-chain instead, purely so a verification run has a second checkable testnet tx hash. This is opt-in (`MOCK_PAYOUT_DEMO_ACCOUNT` env var, unset by default) and is not a claim that real SEP-31 payouts work this way — see `mock-anchor/README.md`. |
| Full detail | `mock-anchor/README.md` |

### 5.3 How to point Ferry at the mock anchor

Set `NEXT_PUBLIC_ANCHOR_DOMAIN=localhost:4001` (or wherever `mock-anchor/` is run) and add that domain to `ANCHOR_ALLOWLIST`, alongside or instead of `testanchor.stellar.org` — see `docs/RUNBOOK.md` §2 for the full environment-variable reference. `lib/stellar/toml.ts` has a narrow, explicitly-scoped exception allowing plain-HTTP `stellar.toml` resolution for `localhost`/`127.0.0.1` domains only (the mock anchor has no TLS certificate); every other domain still requires HTTPS exactly as before.

## 6. Verification Method (once real §1–§4 data exists)

Every parameter in §1–§4 that maps to a machine-readable anchor field should be verified two ways, both cited here with a date:
1. **Programmatically**, against the anchor's own `stellar.toml` and `GET /info` responses (SEP-1, SEP-24 `/info`, SEP-31 `/info`, SEP-38 `/info`) — the same way `TESTNET_HASHES.md` was produced, by actually calling the endpoints and recording the response. §5 above follows this same standard for the EURC/mock-TRY setup specifically.
2. **Contractually**, against the signed pilot agreement or written confirmation from the anchor's business contact, for anything not exposed in a public endpoint (refund SLA, liability terms, pilot pricing).

---

*This template mirrors the structure `TESTNET_HASHES.md` uses for technical evidence: real, dated, sourced data only. Replace every `[ ]` in §1–§4 before this document is used as SOW evidence of a confirmed anchor relationship — §5's EURC/mock-TRY detail is already real, cited, and current, but is a testing capability, not an anchor relationship.*
