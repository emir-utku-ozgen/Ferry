::: cover
# Corridor Verification, Pilot Terms and Cost Baseline {.unnumbered .cover-title}

**Project:** Ferry — EUR → TRY remittance corridor on Stellar (Instawards SOW, Deliverable 1)

**Date:** [TODO: report date]

**Prepared by:** [TODO: name and role]
:::

## 1. Summary

[TODO: 3–4 sentence summary of the results. State (1) whether the EUR-side and TRY-side anchors have confirmed the corridor in writing, (2) the main pilot terms agreed, and (3) what the cost comparison in Section 5 shows — e.g. the total cost of Ferry compared with the traditional channels, quoting the figures from the table.]

## 2. Anchor Confirmations

An *anchor* is a licensed financial company that converts between money in a bank account (EUR or TRY) and money on the Stellar network. Ferry needs one anchor on each side of the corridor: one that accepts euros from the sender, and one that pays out Turkish lira to the recipient. This section records each anchor's written confirmation.

### 2.1 EUR side (sending anchor)

| | |
|---|---|
| Anchor name | [TODO: legal name of the EUR-side anchor] |
| Contact person | [TODO: name and role of the person who confirmed] |
| Date of written confirmation | [TODO: date of the confirmation e-mail] |

<figure><img src="images/eur-anchor-confirmation.png" alt="[TODO: add the confirmation e-mail screenshot as images/eur-anchor-confirmation.png]"><figcaption>Figure 1 — Written confirmation e-mail from the EUR-side anchor</figcaption></figure>

### 2.2 TRY side (receiving anchor)

| | |
|---|---|
| Anchor name | [TODO: legal name of the TRY-side anchor] |
| Contact person | [TODO: name and role of the person who confirmed] |
| Date of written confirmation | [TODO: date of the confirmation e-mail] |

<figure><img src="images/try-anchor-confirmation.png" alt="[TODO: add the confirmation e-mail screenshot as images/try-anchor-confirmation.png]"><figcaption>Figure 2 — Written confirmation e-mail from the TRY-side anchor</figcaption></figure>

## 3. Agreed Pilot Terms

The table below lists the terms agreed with each anchor for the pilot. The two "Agreed" columns must come from the anchors' written confirmations in Section 2.

The last column shows the value Ferry currently uses on the Stellar test network, taken directly from the code, so the reader can see what the software is set up for today. **These are settings of Ferry's own test anchor (a simulation, not a real company). They are not terms agreed with any anchor.**

| Term | Agreed — EUR anchor | Agreed — TRY anchor | Current Ferry test setting (reference only) |
|---|---|---|---|
| Minimum amount per transfer | [TODO] | [TODO] | 0.0001 EURC ¹ |
| Maximum amount per transfer | [TODO] | [TODO] | 1,000 EURC ¹ |
| Fees | [TODO: fixed amount and/or %] | [TODO: fixed amount and/or %] | 0.5% of the amount sent, charged by the test anchor ² |
| How long a price quote stays valid | [TODO] | [TODO] | 5 minutes ³ |
| Refund — what triggers a refund | [TODO] | [TODO] | Ferry stops a transfer *before* any money moves in four cases: rejected by the anchor, failed identity check, invalid bank account (IBAN), expired quote. In these cases there is nothing to refund. ⁴ |
| Refund — how long it takes | [TODO] | [TODO] | Not set — decided by the anchor ⁴ |
| Refund — how the money is returned | [TODO] | [TODO] | Not set — decided by the anchor. Ferry never holds customer money, so it cannot refund itself. ⁴ |

**Where the reference values come from (in the Ferry code repository):**

1. `lib/mockAnchor/config.ts` (`MIN_EURC_AMOUNT`, `MAX_EURC_AMOUNT`); same values in `mock-anchor/server.js`.
2. `app/api/mock-anchor/sep38/quote/route.ts` (fee = amount × 0.005); same in `mock-anchor/server.js`.
3. `app/api/mock-anchor/sep38/quote/route.ts` (quote expires 5 minutes after it is issued); same in `mock-anchor/server.js`. Ferry's interface reads the expiry time sent by whichever anchor it is connected to (`app/page.tsx`), so with a real anchor the anchor's own validity period applies.
4. `docs/REFUND_AND_INCIDENT_PROCEDURES.md` §1–§2 and `components/StatusTracker.tsx`.

## 4. Production Parameters

These are the parameters planned for the live network (Stellar *mainnet*), when real money is used. Values that the repository already fixes are shown with their source; everything that depends on the anchors is still open.

| Parameter | Planned value | Source |
|---|---|---|
| Stellar network | Public Global Stellar Network (mainnet) | `docs/RUNBOOK.md` §2, `lib/stellar/config.ts` |
| Stellar server (Horizon) | `https://horizon.stellar.org` | `docs/RUNBOOK.md` §2 |
| EUR anchor | [TODO: anchor name and domain] | — |
| TRY anchor | [TODO: anchor name and domain] | — |
| EURC token issuer on mainnet | [TODO: Circle's mainnet EURC issuer address, verified] | `docs/RUNBOOK.md` §2 notes the test-network address must not be reused |
| Minimum amount per transfer | [TODO] | — |
| Maximum amount per transfer (and daily/monthly limits, if any) | [TODO] | — |
| Anchor fees | [TODO] | — |
| Ferry's own fee or exchange-rate margin | None — Ferry adds no fee and no margin; the price shown is the anchor's own | `COST_BASELINE.md` §2, `CORRIDOR_VERIFICATION.md` §7 |
| How long a price quote stays valid | [TODO: set by the anchors] | Ferry uses the expiry time each anchor sends (`app/page.tsx`) |
| Refund triggers, time and method | [TODO: from anchor agreements] | `docs/REFUND_AND_INCIDENT_PROCEDURES.md` §4.3 lists this as an open item |
| Settlement time (from sender's payment to recipient's account) | [TODO] | — |

## 5. Cost Comparison Baseline

### 5.1 Method

To compare costs fairly, the same amount of euros was sent to Turkey through each channel on the same day, using real transfers, and each receipt was kept as evidence. The cost of each channel has two parts:

- **The sending fee** — the fee the provider charges openly.
- **The exchange-rate cost** — the hidden cost of converting at a rate worse than the *mid-market rate* (the "real" exchange rate, halfway between the buying and selling rates on the currency market). It also captures any amounts taken off along the way, for example by intermediary banks.

Each channel is measured by what actually arrived in the recipient's account, compared with what the same euros would have been worth at the mid-market rate at the time of the transfer.

The source used for the mid-market rate is stated under the results table.

### 5.2 Formula

For each channel:

- **Total paid (EUR)** = EUR sent + Sending fee
- **Value received (EUR)** = TRY received ÷ Mid-market rate
- **Exchange-rate cost (EUR)** = EUR sent − Value received
- **Total cost (EUR)** = Sending fee + Exchange-rate cost  (equivalently: Total paid − Value received)
- **Total cost (%)** = Total cost ÷ Total paid × 100

For the Ferry (Stellar) row, the sending fee includes all fees charged by the anchors in EUR; any fee taken in TRY is already reflected in the TRY received.

### 5.3 Results

The table below is generated automatically from `transfers.yaml` by `build_cost_table.py`. Do not edit it by hand.

<!-- COST_TABLE_START -->

| Channel | Date | EUR sent | Fee (EUR) | TRY received | Mid-market rate (TRY/EUR) | Exchange-rate cost (EUR) | Total cost (EUR) | Total cost (%) | Receipt |
|---|---|--:|--:|--:|--:|--:|--:|--:|---|
| Ferry (Stellar) | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] |
| [TODO: channel 2 name] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] |
| [TODO: channel 3 name] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] |
| [TODO: channel 4 name] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] |

**Mid-market rate source:** [TODO: fill in mid_market_source in transfers.yaml]

<!-- COST_TABLE_END -->

## 6. Success Criteria Check

| Criterion | Result |
|---|---|
| Both anchors confirmed in writing | [TODO: ✓ or ✗ — ✓ only when both confirmation e-mails in Section 2 are attached] |
| Baseline table shows measured total cost of each channel | ✗ — data incomplete for Ferry (Stellar), channel 2, channel 3, channel 4; receipt missing for Ferry (Stellar), channel 2, channel 3, channel 4 |

<!-- RECEIPTS_START -->

## Appendix A. Transfer Receipts

### Ferry (Stellar)

[TODO: add the receipt screenshot to images/ and set receipt_image in transfers.yaml]

### [TODO: channel 2 name]

[TODO: add the receipt screenshot to images/ and set receipt_image in transfers.yaml]

### [TODO: channel 3 name]

[TODO: add the receipt screenshot to images/ and set receipt_image in transfers.yaml]

### [TODO: channel 4 name]

[TODO: add the receipt screenshot to images/ and set receipt_image in transfers.yaml]

<!-- RECEIPTS_END -->
