# Ferry — Cost & Speed Baseline: EUR → TRY Corridor

**Superseded by `CORRIDOR_VERIFICATION.md` §7**, which replaces the "generally known" figures below with individually sourced and dated ones (including one live-fetched quote) — see that section for the current version of this comparison. This document is kept for its structural-differentiation argument (§2 below, still accurate) but its cost figures should be treated as the earlier, less-rigorously-sourced draft.

**Status:** Illustrative market comparison based on generally known, publicly published fee structures for each channel. Figures are **indicative ranges, not live-verified quotes** — remittance pricing for all three incumbent channels varies by corridor, payment method, amount, and promotional pricing, and changes frequently. Before this document is used in any external submission, the team should pull current, dated quotes directly from each provider for the specific EUR→TRY amount and corridor being represented, and cite the source and date. This document should not be presented as an audited or officially sourced cost study as-is.

---

## 1. Channel Comparison — Sending €500 to Turkey

| Channel | Typical speed | Typical FX spread | Typical fee | Illustrative total cost on €500 | Notes |
|---|---|---|---|---|---|
| **Western Union** (cash payout) | Minutes–hours | ~2–4% above mid-market | Flat fee, varies by payout method (often €5–15 for online transfer) | Roughly €15–35 all-in | Fee + spread both apply; cash pickup often carries the widest spread |
| **Wise** | Minutes–1 business day | Near mid-market (~0.3–1%) | Transparent, disclosed upfront (~0.4–0.6% + small fixed fee) | Roughly €3–8 all-in | Publishes the mid-market rate and its markup separately; generally the cheapest of the three incumbents for this corridor |
| **Traditional bank wire (SWIFT)** | 1–3 business days | ~2–5% above mid-market (often undisclosed) | Flat wire fee (typically €15–45) **plus** a separate receiving-bank fee (often €10–20, deducted on arrival) | Roughly €40–90 all-in | Least transparent: the FX spread is frequently not disclosed as a separate line item, and correspondent-bank fees can arrive as a surprise deduction |
| **Ferry (via Stellar SEPs)** | Seconds (SCP ledger close ~5s) for the on-chain leg; end-to-end speed depends on the anchors' own fiat rails | Anchor-quoted, shown net to the recipient before confirmation via SEP-38 (`buy_amount` — see `TESTNET_HASHES.md` §4 for a live example) | Anchor-set, itemized in the SEP-38 fee breakdown (e.g. the reference anchor's demo fee was $1.00 on a $10 quote — illustrative only, not a production rate) | Depends entirely on the contracted pilot anchor's fee schedule — **not yet established**, see `CORRIDOR_VERIFICATION.md` | Ferry's structural advantage is disclosure: the exact net payout is shown and locked *before* the sender confirms, not estimated |

## 2. What Actually Differentiates Ferry, Structurally

This is defensible from the architecture itself, not a marketing claim:

1. **Pre-committed net payout.** SEP-38's firm quote (`GET/POST /price`, `/quote`) returns `buy_amount` — the exact amount after fees — *before* the sender commits funds, and Ferry locks it via a `quote_id` carried through to the SEP-31 transaction. Western Union and traditional bank wires typically only disclose the fee, not the effective FX spread, until after the transaction is initiated.
2. **Settlement speed on the Stellar leg.** Once anchors move value between each other on Stellar, that leg settles in ~5 seconds (deterministic ledger close — see `GAP_ANALYSIS.md` §2). This does not by itself make the *whole* remittance instant — the fiat-in and fiat-out legs are still bounded by each anchor's own banking rails — but it removes the multi-day interbank correspondent delay that traditional wires incur.
3. **No Ferry-side markup.** Ferry takes no spread and holds no funds (see `GAP_ANALYSIS.md` §3) — 100% of the pricing shown to the user is the contracted anchor's own rate, itemized.

## 3. What This Document Cannot Yet Claim

- **No production pilot anchor fee schedule exists yet** for the EUR→TRY corridor specifically — the "Ferry" row above is structurally accurate about *how* pricing is disclosed, but has no real numbers to compare because no anchor relationship has been finalized (see `CORRIDOR_VERIFICATION.md`).
- Incumbent figures above are **order-of-magnitude illustrations** drawn from generally known public fee structures, not dated quotes pulled for this document. They should be replaced with live, sourced quotes (screenshot or API response, with date) before this is used as evidence in any funding submission.

---

*Recommended next step: once a pilot anchor is contracted, replace the "Ferry" row with real quoted figures from that anchor's SEP-38 `/price` endpoint for a representative EUR→TRY amount, and re-pull dated quotes from Western Union, Wise, and a reference bank for the same amount and date, to make this a genuinely apples-to-apples comparison.*
