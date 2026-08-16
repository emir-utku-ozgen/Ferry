# Ferry — Testnet Transaction Evidence

**Status:** Genuine, live evidence only. §1–§7 came from a real run against Stellar Testnet and the public reference anchor (`testanchor.stellar.org`) on 2026-08-13, executed through Ferry's own `/api/*` orchestrator routes exactly as the browser UI calls them. §8 is a second, later run (2026-08-16) against Ferry's own mock anchor (`mock-anchor/`) for the EUR(EURC)→TRY corridor, held to the same standard. Nothing in this document is simulated or invented.

Where a requested scenario **could not** be genuinely reproduced, that is stated explicitly, with the reason, rather than filled in with a plausible-looking fake result. See §"Failure scenarios" below §7, and §8.4 for the EURC leg specifically.

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

## 8. EUR(EURC) → TRY Corridor — Mock Anchor Run (2026-08-16)

Run against Ferry's own mock anchor (`mock-anchor/`, `localhost:4001`) via `NEXT_PUBLIC_ANCHOR_DOMAIN=localhost:4001` / `ANCHOR_ALLOWLIST=localhost:4001`, through Ferry's real `/api/*` routes — same standard as §1–§7. See `CORRIDOR_VERIFICATION.md` §5 for what's real (Circle's EURC) vs. simulated (the TRY leg) here.

### 8.1 Test accounts

```
Sender:     GC5DB4NCUBTU4TTBDA6JDDXPSMYNPZ6BTSM4LTX6OTVLHAX6PTSMGXIC  (funded via Friendbot)
Recipient:  GCWF5ZQBC6P4YFTM5TKYOC3KVGOENITGCNC2KZMYYPJQIL7H34HZ2TWN  (funded via Friendbot)
Mock anchor SEP-10 signing / EURC-receiving account:
            GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF
Mock TRY issuer:
            GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ
```

Two real, independently-verifiable on-chain setup transactions:
```
Sender's EURC trustline    tx hash: d6ba0524e1398ff5fdf9c0f3cc7dc406f337ceed8b4d9da4e58a059405f6211a
Recipient's TRY trustline  tx hash: dc885fd22295d8775549a88fb3ee5946e781b86ba160c5900ced6583b9f7da72
```
Verifiable via `GET https://horizon-testnet.stellar.org/transactions/<hash>` or `stellar.expert/explorer/testnet/tx/<hash>`.

### 8.2 SEP-10 → SEP-38 → SEP-12 → SEP-31, all live, all through Ferry's own code

- **SEP-10:** `POST /api/sep10/challenge` (domain=`localhost:4001`) → real challenge XDR returned, built via `@stellar/stellar-sdk`'s `WebAuth.buildChallengeTx` inside the mock anchor. Signed locally with the sender's keypair, exchanged via `POST /api/sep10/token` → anchor returned a valid HS256 JWT.
- **SEP-38 firm quote:** `POST /api/sep38/quote`, `sell_asset=stellar:EURC:GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, `buy_asset=stellar:TRY:GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ`:
  ```
  Quote ID:    mockq_msvru06byc2p
  Sell:        10 EURC
  Buy (net):   442.7750000 TRY
  Fee:         0.05 EURC ("Mock anchor fee")
  Price:       44.5 (fixed, illustrative — not a live FX feed; see mock-anchor/README.md)
  Expires at:  2026-08-16T12:23:36.515Z
  ```
- **SEP-12:** `GET /api/sep12/customer` → `NEEDS_INFO` with `first_name`/`last_name`/`email_address`. `PUT` submitted with `{first_name: "Ada", last_name: "Lovelace", email_address: "ada@example.com"}` → re-queried status **`ACCEPTED`** (mock anchor accepts any submission immediately — see `mock-anchor/README.md`, this is explicitly not real verification).
- **SEP-31 transaction creation:** `POST /api/sep31/transactions`, `asset_code=EURC`, `quote_id=mockq_msvru06byc2p`:
  ```
  Transaction ID:     t48w8atq
  stellar_account_id: GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF
  stellar_memo_type:  text
  stellar_memo:       t48w8atq
  ```

### 8.3 What was NOT completed, and exactly why

**The sender never actually sent the EURC payment**, so the mock anchor's transaction `t48w8atq` remained in `pending_receiver` and the optional demonstrative TRY payout (which only fires once that payment is detected — see `mock-anchor/README.md`) never triggered. No payment tx hash and no payout tx hash exist for this run. Being direct about this rather than inventing a hash:

Completing this last step requires the sender account to actually hold Testnet EURC. Every avenue available in this environment was tried and exhausted:
1. **Circle's public web faucet** (`faucet.circle.com`) — genuinely exists, is unauthenticated, and lists Stellar Testnet, but it's a browser UI with no automatable API; requesting it required a human. A request was submitted to the sender address above; after 10+ minutes of polling `GET /accounts/{sender}` on Horizon Testnet, no EURC balance or payment ever appeared.
2. **Circle's programmatic faucet API** (`POST /v1/faucet/drips`) — requires an `Authorization: Bearer` token tied to a Circle account that has completed *Mainnet* identity verification, even to claim Testnet tokens. No such account is available here.
3. **Stellar Testnet DEX liquidity** — checked directly via Horizon: the real EURC asset's total liquidity-pool depth on Testnet is `0.0856606 EURC` across 3 pools (`GET /assets?asset_code=EURC&asset_issuer=GB3Q6Q...`), and the one resting order-book offer found priced EURC at an implausible 40,000:1 against XLM with sub-1-unit size — neither is sufficient to acquire a usable EURC balance via a path payment.

**What this means in practice:** the entire request/response chain — SEP-10 auth, SEP-38 pricing, SEP-12 KYC, SEP-31 transaction creation — is real, live-verified, and runs through Ferry's actual orchestrator code exactly as the browser UI would call it. The one link that could not be exercised end-to-end is the final on-chain EURC transfer itself, blocked entirely by *external* Testnet EURC acquisition constraints (§8.3 above), not by anything in Ferry's own code or the mock anchor. Anyone who *does* hold Testnet EURC can complete this run themselves: send the quoted amount, with a text memo equal to the transaction id, to the `stellar_account_id` above, and the mock anchor's own background poller (`mock-anchor/server.js`) will detect it and complete the transaction within 5 seconds — no manual intervention required on the anchor side.

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

*Every identifier above is independently verifiable: Stellar transaction hashes against `https://horizon-testnet.stellar.org`, §1–§7's anchor-issued IDs and JWTs against `testanchor.stellar.org` directly. §8's mock-anchor-issued IDs and JWT are only re-checkable by running `mock-anchor/` yourself (it's not a persistently-hosted service) — the on-chain trustline hashes in §8.1 remain checkable by anyone at any time, same as any other Stellar Testnet transaction.*
