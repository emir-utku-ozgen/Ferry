::: cover
# Corridor Verification, Pilot Terms and Cost Baseline {.unnumbered .cover-title}

**Project:** Ferry — EUR → TRY remittance corridor on Stellar (Instawards SOW, Deliverable 1)

**Date:** 2026-10-08

**Prepared by:** Emir Utku Özgen
:::

## 1. Summary

As of 8 October 2026, neither the EUR-side nor the TRY-side anchor has confirmed the corridor in writing; outreach is in progress, and the pilot terms in Section 3 are Ferry's proposal, subject to final agreement with the anchors. The measured same-day cost comparison in Section 5 has not yet been carried out, because it requires real transfers through each channel; dated reference figures from published sources are included in the meantime. On the technical side, Ferry's complete SEP-10 → SEP-12 → SEP-38 → SEP-31 flow completed three EURC transfers on the Stellar test network on 8 October 2026 against a simulated TRY anchor (Section 6), and every transaction can be checked independently on a public block explorer. Both success criteria in Section 7 are therefore not yet met.

## 2. Anchor Confirmations

An *anchor* is a licensed financial company that converts between money in a bank account (EUR or TRY) and money on the Stellar network. Ferry needs one anchor on each side of the corridor: one that accepts euros from the sender, and one that pays out Turkish lira to the recipient. This section records the status of each anchor's written confirmation.

### 2.1 EUR side (sending anchor)

| | |
|---|---|
| Status | Outreach in progress; no written confirmation as of 2026-10-08 |
| Anchor name | Not yet disclosed — no agreement in place |
| Contact person | Not applicable until confirmation is received |
| Date of written confirmation | None received |

### 2.2 TRY side (receiving anchor)

| | |
|---|---|
| Status | Outreach in progress; no written confirmation as of 2026-10-08 |
| Anchor name | Not yet disclosed — no agreement in place |
| Contact person | Not applicable until confirmation is received |
| Date of written confirmation | None received |

When confirmations arrive, the confirmation e-mails will be attached to this section as screenshots.

## 3. Proposed Pilot Terms (Subject to final anchor agreement)

The table below sets out the terms Ferry proposes for the pilot. **None of these terms has been agreed with an anchor.** Where a term is the anchor's decision under its licence (for example transaction limits), no figure is proposed; Ferry's software applies whatever the anchor sets. The last column shows how the current software behaves on the Stellar test network, with the source in the Ferry code repository.

| Term | Proposal | Current software behaviour (Testnet) |
|---|---|---|
| Corridor | EUR → TRY. Euros are carried on Stellar as Circle's EURC stablecoin; the TRY anchor pays out lira to the recipient's bank account. | EURC (Circle, Testnet) → simulated TRY asset ¹ |
| Minimum / maximum per transfer | Set by each anchor according to its licence and customer-verification tiers. No figure proposed by Ferry. | Test anchor accepts 0.0001 – 1,000 EURC ² |
| Cumulative (daily / monthly) limits | Set by each anchor. No figure proposed by Ferry. | No cumulative limit in the test anchor |
| Ferry fee | None. Ferry adds no fee and no exchange-rate margin. ³ | No Ferry fee in the code ³ |
| Anchor fees | Anchor's own fee schedule, shown to the sender item by item before the sender confirms (SEP-38 quote). | Test anchor charges 0.5% of the amount sent ⁴ |
| Price quote validity | Set by the anchor. Ferry blocks sending once a quote has expired. | 5 minutes in the test anchor; Ferry reads the expiry time from whichever anchor it is connected to ⁴ |
| Refund — triggers | Four failure cases are caught *before* any money moves (anchor rejection, failed identity check, invalid IBAN, expired quote), so no refund is needed. Refunds after money has moved are made by the anchor holding the funds. ⁵ | Implemented as designed error screens ⁵ |
| Refund — time and method | To be set in the anchor agreement. Ferry never holds customer money, so it cannot refund itself; it shows the anchor's refund status to the user. ⁵ | Ferry displays the anchor's own refund data (SEP-24) ⁵ |
| Settlement time | Stellar leg: seconds. Bank legs (euro in, lira out): set by each anchor. | Test transfers confirmed `completed` within about 9 seconds of payment (Section 6.1) |
| Service levels (SLA) | To be agreed in the anchor agreements; no SLA has been committed yet. | — |
| Pilot success criteria | Both anchors confirmed in writing, and a measured cost baseline for each channel (Section 7). | — |

**Sources in the Ferry code repository:**

1. `CORRIDOR_VERIFICATION.md` §5 (EURC issuer verification; simulated TRY anchor).
2. `lib/mockAnchor/config.ts` (`MIN_EURC_AMOUNT`, `MAX_EURC_AMOUNT`); same values in `mock-anchor/server.js`.
3. `COST_BASELINE.md` §2; `CORRIDOR_VERIFICATION.md` §7.
4. `app/api/mock-anchor/sep38/quote/route.ts` (fee = amount × 0.005; quote expires 5 minutes after issue); quote expiry handling in `app/page.tsx`.
5. `docs/REFUND_AND_INCIDENT_PROCEDURES.md` §1–§3; `components/StatusTracker.tsx`.

## 4. Production Parameters

These are the parameters planned for the live Stellar network (*mainnet*), when real money is used. Parameters that depend on the anchors remain open until the agreements in Section 2 are in place.

| Parameter | Planned value | Source |
|---|---|---|
| Stellar network | Public Global Stellar Network (mainnet) | `docs/RUNBOOK.md` §2, `lib/stellar/config.ts` |
| Stellar server (Horizon) | `https://horizon.stellar.org` | `docs/RUNBOOK.md` §2 |
| EUR and TRY anchors | Open — depends on the anchor confirmations in Section 2 | — |
| EURC token issuer on mainnet | Circle's mainnet EURC issuer, to be verified against Circle's published contract addresses and on-chain data before cutover; the Testnet address must not be reused | `docs/RUNBOOK.md` §2 |
| Transaction limits | Open — set by the anchors (see Section 3) | — |
| Anchor fees | Open — set by the anchors | — |
| Ferry's own fee or exchange-rate margin | None — the price shown is the anchor's own | `COST_BASELINE.md` §2, `CORRIDOR_VERIFICATION.md` §7 |
| Price quote validity | Set by the anchors; Ferry applies the expiry time each anchor sends | `app/page.tsx` |
| Refund triggers, time and method | Open — listed as an item to agree before go-live | `docs/REFUND_AND_INCIDENT_PROCEDURES.md` §4.3 |
| End-to-end settlement time | Open — bounded by each anchor's banking rails | — |

## 5. Cost Comparison Baseline

### 5.1 Method

To compare costs fairly, the same amount of euros is sent to Turkey through each channel on the same day, using real transfers, and each receipt is kept as evidence. The cost of each channel has two parts:

- **The sending fee** — the fee the provider charges openly.
- **The exchange-rate cost** — the hidden cost of converting at a rate worse than the *mid-market rate* (the "real" exchange rate, halfway between the buying and selling rates on the currency market). It also captures any amounts taken off along the way, for example by intermediary banks.

Each channel is measured by what actually arrived in the recipient's account, compared with what the same euros would have been worth at the mid-market rate at the time of the transfer.

### 5.2 Formula

For each channel:

- **Total paid (EUR)** = EUR sent + Sending fee
- **Value received (EUR)** = TRY received ÷ Mid-market rate
- **Exchange-rate cost (EUR)** = EUR sent − Value received
- **Total cost (EUR)** = Sending fee + Exchange-rate cost  (equivalently: Total paid − Value received)
- **Total cost (%)** = Total cost ÷ Total paid × 100

For the Ferry (Stellar) row, the sending fee includes all fees charged by the anchors in EUR; any fee taken in TRY is already reflected in the TRY received.

### 5.3 Results

The table below is generated automatically from `transfers.yaml` by `build_cost_table.py`.

<!-- COST_TABLE_START -->

No measured transfers have been recorded yet. The same-day transfers through each channel are still to be made; until then, see the published reference figures in 5.4.

<!-- COST_TABLE_END -->

### 5.4 Published reference figures (not the measured baseline)

Until the measured transfers are made, the following dated figures — recorded on 2026-08-16 for a €1,000 transfer, and documented with their sources in `CORRIDOR_VERIFICATION.md` §7 — give an indication of incumbent costs. Only the Wise figure is a live quote; the other two are estimates built from published fee and markup data. None of them is a completed transfer.

| Channel | Basis | Recipient receives (on €1,000) | Indicative all-in cost |
|---|---|--:|--:|
| Wise | Live quote from Wise's calculator; rate 55.4001 TRY/EUR, fee €6.91 | 55,017.29 TRY | €6.91 (0.69%) |
| Western Union | Estimate from published fee/markup comparisons | ≈ 52,350 – 54,735 TRY | ≈ €12 – €55 |
| Bank wire (SWIFT) | Estimate from published fee/markup data, incl. intermediary fees | ≈ 47,644 – 51,522 TRY | ≈ €70 – €140 |
| Ferry (Stellar) | No production anchor pricing yet — the test anchor's rate (55.35 TRY/EURC) is a fixed test setting, not a quoted price, so no real cost can be calculated | — | — |

The Wise figure follows the formula in 5.2: €993.09 converted plus €6.91 fee = €1,000 paid; 55,017.29 ÷ 55.4001 = €993.09 received in value, so the exchange-rate cost is €0.00 and the total cost is the €6.91 fee (0.69%).

## 6. Technical Corridor Evidence (Testnet, simulated TRY anchor)

**These tests were run on the Stellar test network against Ferry's own simulated TRY anchor, not against a licensed anchor.** The EUR side uses Circle's real EURC token on the test network; the TRY side is a test asset issued by Ferry's simulation, with a fixed exchange rate of 55.35 TRY per EURC and a 0.5% fee. The 55.35 rate is a test setting chosen for this run, not a live market rate. No real money or real lira payout is involved. The tests show that Ferry's software completes the full corridor flow and handles failures correctly; they say nothing about production prices.

Every transaction hash below can be checked by anyone at `https://stellar.expert/explorer/testnet/tx/<hash>`; ledger numbers and timestamps were read back from the public Stellar test-network server (Horizon). Full logs are in `TESTNET_HASHES.md` §11.

### 6.1 Completed transfers (run of 2026-10-08)

Three transfers of different amounts were run on 2026-10-08 through Ferry's own server routes, exactly as the web interface calls them, against the standalone simulated anchor (`mock-anchor/`). All three were sent from one new test account (`GCNAYI4LKBYBGXWYK737H3GNETLCPO5ZAUCIZ3MLFG2RL2ACO2DJMLGN`). Because Testnet EURC cannot be obtained automatically, this account was funded with 8.5 EURC from the simulated anchor's own test account (transaction `7e775bb98c7abca2f6943d434c42b90fa5f7da4d3a88aead77e8525e55d0090f`).

| | Transfer A | Transfer B | Transfer C |
|---|--:|--:|--:|
| SEP-31 transaction ID | `3lfeapkd` | `hge71rtb` | `fcj4s1b0` |
| SEP-38 quote ID | `mockq_muztre00zw4o` | `mockq_muztrnlwxarm` | `mockq_muztrvhzp4d1` |
| EURC sent | 5.0000000 | 2.5000000 | 1.0000000 |
| Anchor fee (0.5%) | 0.0250000 EURC | 0.0125000 EURC | 0.0050000 EURC |
| EURC converted | 4.9750000 | 2.4875000 | 0.9950000 |
| Exchange rate (test, fixed) | 55.35 TRY/EURC | 55.35 TRY/EURC | 55.35 TRY/EURC |
| Net TRY to recipient | 275.3662500 TRY | 137.6831250 TRY | 55.0732500 TRY |
| Quote issued (UTC) | 17:43:03 | 17:43:15 | 17:43:25 |
| EURC payment — ledger, time (UTC) | 5091560, 17:43:07 | 5091562, 17:43:17 | 5091565, 17:43:32 |
| TRY payout — ledger, time (UTC) | 5091561, 17:43:12 | 5091563, 17:43:22 | 5091566, 17:43:37 |
| Final status | `completed` | `completed` | `completed` |

**Transaction hashes:**

| Transfer | Transaction | Hash |
|---|---|---|
| A | EURC payment (sender → anchor) | `99389e9daf565ee4beb1f78a76e2beb429b9c8abdbfd2e167acdf237184ee561` |
| A | TRY payout (anchor → recipient) | `3aeadf53ac16499207705ab1afb761c89ed30f5c78c40b08269ce4ed63ba9a92` |
| B | EURC payment (sender → anchor) | `58ce0f347152d8f7343b79d3a4826e89848e909e351b9a904286f47790322e57` |
| B | TRY payout (anchor → recipient) | `51681c89a276cc73964053094bd6db5ac8fe6daa4521890aebc38cac68f1c38a` |
| C | EURC payment (sender → anchor) | `bd7c7f1aead32408fc0f64517f6e1f68c3515f29caf6a10c1acebcdffe580db8` |
| C | TRY payout (anchor → recipient) | `f265bc3a88179610a333238c04498240257cd724e998feeb29f2b83c0dd811ec` |

The TRY payout is a demonstration only: the simulated anchor sends its test TRY asset on-chain so that the payout side has a checkable record. A real anchor pays out lira by bank transfer.

**How the amounts fit together:** net TRY = (EURC sent − fee) × 55.35, with fee = 0.5% of EURC sent.

- Transfer A: (5 − 0.025) × 55.35 = 4.975 × 55.35 = 275.36625 TRY
- Transfer B: (2.5 − 0.0125) × 55.35 = 2.4875 × 55.35 = 137.683125 TRY
- Transfer C: (1 − 0.005) × 55.35 = 0.995 × 55.35 = 55.07325 TRY

In each case the TRY amount paid on-chain is exactly the net amount in the quote.

**Flow steps** (the same for each transfer):

1. **SEP-10 — sign-in.** Ferry requested a sign-in challenge from the anchor; it was signed with the sender's key and exchanged for an access token (17:43:03 UTC).
2. **SEP-12 — customer information.** Test customer details were submitted; the anchor reported the customer as `ACCEPTED`.
3. **SEP-38 — firm quote.** The anchor returned a firm quote with the fee and net TRY amount, valid for 5 minutes.
4. **SEP-31 — transfer created.** The anchor returned its receiving account and a payment reference (memo equal to the transaction ID).
5. **On-chain payment.** The sender paid the EURC amount with that memo, well within the quote's validity.
6. **Settlement.** The anchor matched the payment by memo and amount, marked the transfer `completed`, and sent the TRY payout. Ferry's status check confirmed `completed` with the received amount equal to the invoiced amount, within about 9 seconds of the payment (the status was checked every 4 seconds).

*Earlier completed runs at the previous test rate (44.5 TRY/EURC) remain on record in `TESTNET_HASHES.md` §8 and §10. SEP-24 (hosted deposit/withdrawal) is not part of this corridor's flow; its separate test evidence is in `TESTNET_HASHES.md` §5.*

### 6.2 Rejected transfers (failure handling)

On 2026-08-20, four invalid transfer requests were sent through Ferry's SEP-31 route to the simulated anchor. Each was rejected by the anchor with a clear error, and in every case no money was sent.

| # | Scenario | Request | Anchor response | Money sent |
|---|---|---|---|---|
| 1 | Unsupported asset | Asset USDC | Rejected: only EURC is supported | None |
| 2 | Amount too large | 5,000 EURC | Rejected: `too_large` (allowed range 0.0001 – 1,000 EURC) | None |
| 3 | Amount too small | 0.00001 EURC | Rejected: `too_small` (allowed range 0.0001 – 1,000 EURC) | None |
| 4 | Expired quote | Quote `mockq_mt1mdkc0f63e` (expired 14:37:28 UTC) submitted at 14:37:38 UTC | Rejected: `quote_expired` | None |

Two further failure cases — a failed identity check and an invalid IBAN — cannot be produced by an anchor on the test network, because no available test anchor validates this data strictly enough. Ferry does catch an invalid IBAN itself before submitting (format and checksum check); the anchor-side rejections will be tested with the contracted anchors.

## 7. Success Criteria Check

| Criterion | Result |
|---|---|
| Both anchors confirmed in writing | ✗ — Outreach to both the EUR-side and the TRY-side anchor is in progress; no written confirmation had been received as of 2026-10-08 (Section 2). |
| Baseline table shows measured total cost of each channel | ✗ — The same-day measured transfers have not been made yet, so no channel's total cost has been measured (Section 5). Published reference figures are given in 5.4. |

<!-- RECEIPTS_START -->



<!-- RECEIPTS_END -->
