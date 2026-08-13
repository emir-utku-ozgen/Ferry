# Ferry — Testnet Transaction Evidence

**Status:** Genuine, live evidence only. Every hash, ID, and response body below came from a real run against Stellar Testnet and the public reference anchor (`testanchor.stellar.org`) on 2026-08-13, executed through Ferry's own `/api/*` orchestrator routes exactly as the browser UI calls them. Nothing in this document is simulated or invented.

Where a requested scenario **could not** be genuinely reproduced against this anchor, that is stated explicitly, with the reason, rather than filled in with a plausible-looking fake result. See §5.

---

## 1. Test Account

```
Account:  GAWWDX72FXIG36PRLY2NC4ULVCRZ7E6ZIG2Z4IZS6YDBR4XPUM55FQSS
Network:  Stellar Testnet
Funded:   via Friendbot
Tx hash:  de58d7f25a376f4ca562ca990c3baffbf64af9ceffe63d16105cf7491e9513ca
```

## 2. SEP-10 — Web Authentication

- Challenge requested from `https://testanchor.stellar.org/auth` via `POST /api/sep10/challenge`.
- Challenge transaction hash (XDR-computed locally — **this transaction is never submitted to the network**, by design; SEP-10 challenges carry `sourceAccount` sequence number `0` and exist only to be signed as a proof-of-key-control artifact):
  ```
  4c2fc5bc07e3364f422ef768de6f982a2834f3245f86c1a4b2e238ad16dcb2ca
  ```
- Signed with the test account's Freighter-equivalent keypair and exchanged via `POST /api/sep10/token` → anchor returned a valid JWT (428 characters, HS256).

## 3. SEP-12 — Customer Info (KYC)

- `GET /api/sep12/customer` → anchor returned `NEEDS_INFO` with 47 available fields.
- `PUT /api/sep12/customer` submitted with `first_name`, `last_name`, `email_address` only.
- Anchor-issued customer ID: `f5d50319-98ad-4f62-8be0-f81870366aae`
- Re-queried status: **`ACCEPTED`** — this anchor's minimum requirement is exactly those three fields; no bank/IBAN fields were required to reach `ACCEPTED` on this instance.

## 4. SEP-38 — Firm Quote (EUR→TRY corridor pricing model, executed here on USD→USDC since this anchor doesn't have EUR/TRY configured — see §5)

```
Quote ID:      a4d9ce8f-b2f7-4d8b-a28b-6976febe6366
Sell:          10 USD
Buy (net):     8.8235 USDC
Fee:           1.00 USD ("Sell fee — Fee related to selling the asset.")
Expires at:    2026-08-14T12:00:00Z
```
The `buy_amount` field (`8.8235`) is the anchor-guaranteed net amount after the fee shown — this is exactly the figure Ferry's UI surfaces as "recipient nets."

## 5. SEP-24 — Hosted Interactive Deposit

```
Transaction ID:  c5234298-1ebd-4e36-b9aa-2b14e91263ae
Interactive URL: https://anchor-ref-ui-testanchor.stellar.org?transaction_id=c5234298-...&token=<sep24-scoped JWT>
Status polled:   incomplete  (session opened; would progress to pending_user_transfer_start
                 → completed only once a human completes the anchor's hosted form —
                 see limitation note below)
```

## 6. ChangeTrust — Real On-Chain Settlement (Gap 4.3 pre-flight trustline flow)

This is the one transaction type Ferry itself constructs, signs (via Freighter in the real UI), and submits — and it is genuinely included in a closed Stellar ledger:

```
Tx hash:   03830e081fea163c3a690fe1ad1513061b8a67344b1dea224ef3c172b3c0f78f
Ledger:    4123148
Successful: true
Explorer:  https://stellar.expert/explorer/testnet/tx/03830e081fea163c3a690fe1ad1513061b8a67344b1dea224ef3c172b3c0f78f
```
Verifiable independently by anyone via the explorer link or `GET https://horizon-testnet.stellar.org/transactions/03830e08...`.

## 7. SEP-31 — Real Anchor-Side Rejection

```
HTTP 400, code: ANCHOR_REJECTED
{"error":"Asset [USDC] has no fields definition"}
```
Reproduced consistently across multiple independent test accounts (with and without completed SEP-12 KYC — see below), confirming this is a **server-side configuration gap on the public reference anchor's SEP-31 instance**, not an intermittent fault or a bug in Ferry's request. Ferry's typed error handling (`ANCHOR_REJECTED`, HTTP passed through) surfaces this cleanly instead of masking it.

---

## Failure scenarios requested but not genuinely reproducible against this anchor

Being direct about this rather than inventing results:

| Requested scenario | Outcome | Why |
|---|---|---|
| **Failed KYC** | Not reproducible | Submitted deliberately malformed data (empty `first_name`/`last_name`, invalid email format) — the reference anchor performed no field-level validation and returned `ACCEPTED` anyway. This anchor's SEP-12 implementation is a minimal demo; it doesn't reject on data quality. |
| **Invalid IBAN** | Not reproducible | Ferry has no client-side IBAN format validator (not yet built), and this anchor's `bank_account_number` field is an unvalidated free-text string — it accepts any value. Reproducing this scenario requires either building IBAN format validation into Ferry itself, or testing against an anchor with real bank-detail validation. |
| **Expired quote, rejected by the anchor** | Not reproducible | Requested `expire_after` in the past; the anchor ignored the parameter and always returns the same fixed `2026-08-14T12:00:00Z` cutoff. Ferry's own client-side guard (blocking submission once `Date.now() >= expires_at`) is real and tested — see `components/QuoteCalculator.tsx` / `components/TransferPanel.tsx` — but a genuine anchor-side rejection of an expired `quote_id` could not be triggered against this instance. |
| **Refund** | Not attempted | Requires a human to complete the anchor's hosted SEP-24 form (§5) and the anchor to subsequently reverse a completed transaction — both outside what's automatable via API calls alone. |

**What this means in practice:** Ferry's request/response plumbing, error typing, and client-side guardrails (quote expiry, trustline pre-flight) are real and verified end-to-end. The specific business-rule rejections above depend on anchor-side behavior that the public Stellar reference anchor doesn't implement strictly enough to exercise. A production pilot anchor with real KYC/IBAN validation would be needed to capture genuine evidence for those rows — and that evidence should be gathered the same way this document was: by actually running the transactions, not writing plausible outcomes.

---

*Every identifier above is independently verifiable: Stellar transaction hashes against `https://horizon-testnet.stellar.org`, anchor-issued IDs and JWTs against `testanchor.stellar.org` directly.*
