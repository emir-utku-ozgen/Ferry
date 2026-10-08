# Ferry — Testnet Transaction Evidence

**Status:** Genuine, live evidence only. §1–§7 came from a real run against Stellar Testnet and the public reference anchor (`testanchor.stellar.org`) on 2026-08-13, executed through Ferry's own `/api/*` orchestrator routes exactly as the browser UI calls them. §8 is a second run (2026-08-16) against Ferry's own mock anchor (`mock-anchor/`) for the EUR(EURC)→TRY corridor, held to the same standard — §8.2–§8.3 record the SEP-10/38/12/31 chain plus the EURC-funding blocker as it stood earlier that day; §8.4, later the same day, records the payment itself actually landing and the transfer genuinely reaching `completed` — Ferry's first fully on-chain-settled transfer on record. §9 is a third run (2026-08-20) verifying that session's P0-1/P0-3 correctness fixes — a genuine anchor-side expired-quote rejection (previously unreproducible against any available anchor) plus the full anchor-rejection failure matrix; the on-chain underpayment/full-payment leg for P0-1 specifically remains blocked on EURC acquisition, stated plainly in §9.6. Nothing in this document is simulated or invented.

Where a requested scenario **could not** be genuinely reproduced, that is stated explicitly, with the reason, rather than filled in with a plausible-looking fake result. See §"Failure scenarios" below §7, and §8.3 for the (since-resolved) EURC-funding blocker specifically.

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

**Update, same day: this final link has since been closed — see §8.4.**

### 8.4 Completion — a real EURC payment, genuinely settled (2026-08-16, later same day)

The repo owner obtained real Testnet EURC in their own wallet from Circle's public faucet and completed the run described above as its own SEP-10-authenticated session (a fresh account, not the Friendbot-only sender in §8.1 — that account never received EURC). Full chain, in order:

1. **SEP-10, signed by the account holder's own wallet.** Ferry's `/api/sep10/challenge` built the challenge; the account holder signed it via Stellar Laboratory's transaction signer (`laboratory.stellar.org/#txsigner`) connected to Freighter — the private key never left the extension, exactly as the architecture requires. The signed XDR was exchanged via `/api/sep10/token` for a JWT scoped to `GDN3U7JKXSEMR65YFI3BU3JDQYFFNPMH5RP7YOOY43XIDDUZC6D6TS6A`.
2. **Real bug found and fixed mid-run:** the mock anchor's own receiving account (`GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF`) had never established a trustline to EURC — an oversight in `mock-anchor/` from when it was first built, never previously caught because no run had gotten this far. The first payment attempt correctly failed with `op_no_trust`. Fixed by submitting a `ChangeTrust` operation signed with the receiving account's own key (`mock-anchor/.env`'s `SIGNING_SECRET` — infrastructure Ferry's own tooling controls, not a user's key):
   ```
   Trustline tx hash: 3a5793498f2386f19198044cc061bb710d9fdd6c8fee6bfcb31149366ed9251f
   ```
3. **First payment attempt sent with the wrong memo** (a Freighter UI mix-up — the literal string `"Text"` was submitted instead of the transaction id) — landed successfully on-chain (`ad6676c1fa41a49eee96d07fa3e504fdfa28eb16b33c77f01478c491f810e128`, 0.005 EURC) but could not be matched to a SEP-31 transaction, by design: the mock anchor's memo-matching guard exists specifically so an incoming payment can't be silently credited to the wrong transfer, and it was not overridden or force-matched. Recorded here for completeness, not presented as a settled transfer.
4. **Second attempt, correct memo, genuinely completed:**
   ```
   Stellar transaction hash: 5b6f6a3378f5e0cf446b420e1adc52b1027e0493869d5087d9ce8cb78c15af91
   From:                     GDN3U7JKXSEMR65YFI3BU3JDQYFFNPMH5RP7YOOY43XIDDUZC6D6TS6A
   To:                       GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF
   Asset:                    EURC (GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO)
   Amount:                   0.0009000
   Memo:                     6dt9lah4  (= the SEP-31 transaction id)
   successful:               true
   Explorer:                 https://stellar.expert/explorer/testnet/tx/5b6f6a3378f5e0cf446b420e1adc52b1027e0493869d5087d9ce8cb78c15af91
   ```
   The mock anchor's background poller (`mock-anchor/server.js`, unmodified detection logic) matched this **independently**, on its own 5-second poll cycle, and set the SEP-31 transaction's status to `completed` with `stellar_transaction_id` equal to the hash above — confirmed by querying `GET /api/sep31/transactions?id=6dt9lah4` directly, not by trusting a log line.
5. **The demo TRY payout also fired** (a `MOCK_PAYOUT_DEMO_ACCOUNT` was configured from an earlier session), producing a second, independent real transaction:
   ```
   Stellar transaction hash: f46f134cbb85f7129ab4e61ff4e7f76aa8838fdf559d19cc2442c9a0a31db355
   From:                     GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ (mock TRY issuer)
   To:                       GCWF5ZQBC6P4YFTM5TKYOC3KVGOENITGCNC2KZMYYPJQIL7H34HZ2TWN
   Asset:                    TRY (GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ)
   Amount:                   0.0398498
   successful:               true
   ```
   As stated in `mock-anchor/README.md`: this is a demonstration artifact, not a claim about how real SEP-31 payouts work (those are a bank wire, with no Stellar leg at all).

**This closes the gap §8.3 documented as blocking**: Ferry's SEP-10 → SEP-38 → SEP-12 → SEP-31 chain, run through its own orchestrator code, now has one genuine, independently-verifiable, on-chain-settled transfer to point to — not a fabricated status, not a hand-set flag. Both hashes above are checkable by anyone at `https://horizon-testnet.stellar.org/transactions/<hash>` or Stellar Expert, indefinitely (unlike the mock anchor's own JWTs/IDs, on-chain transactions don't require the mock anchor to still be running).

---

## 9. P0/P1 Fix-Verification Run (2026-08-20) — mock anchor

Run against Ferry's own mock anchor (`mock-anchor/`, `localhost:4001`), through Ferry's real `/api/*` routes, specifically to capture live evidence for the two P0 correctness fixes made this session: (P0-1) the payment-matching poller now requires the cumulative amount received under a memo to cover the invoiced amount before marking a transaction `completed` (previously matched on memo alone); (P0-3) `POST /sep31/transactions` now rejects an expired `quote_id` server-side (previously never enforced by any anchor Ferry had access to). Same standard as §1–§8: real, dated, sourced, nothing invented; where a step is genuinely blocked, that's stated plainly below rather than filled in.

### 9.1 Test account

```
Account:   GBNQZLNULTC4Z7TBOIK2CKNZFNFAW7K3HXIXLBDWJKQDI675YYV6TOTW
Funded:    via Friendbot
Tx hash:   06b5792890772f038489426526c331fec36afd575a1135bddc71506800cd716a
```

Generated and signed by script (not Freighter) for this evidence run — same pattern as §1's "Freighter-equivalent keypair," secret held only locally, Testnet-only, zero value.

### 9.2 EURC trustline

```
Tx hash:   bb65051823110659fe4c9b67c664ea4e30c035349cf650ed9b9b3073377b891b
```

### 9.3 SEP-10 → SEP-38 → SEP-12, live through Ferry's own code

- **SEP-10**: real challenge issued by `localhost:4001`, signed locally, exchanged via `POST /api/sep10/token` for a valid JWT.
- **SEP-38 firm quote**: `POST /api/sep38/quote`, `sell_asset=stellar:EURC:GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, `buy_asset=stellar:TRY:GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ`, `sell_amount=10`:
  ```
  Quote ID:    mockq_mt1mdkc0f63e
  Buy (net):   442.7750000 TRY
  Fee:         0.05 EURC
  Expires at:  2026-08-20T14:37:28.464Z
  ```
- **SEP-12**: `GET` → `NEEDS_INFO`; `PUT {first_name: "Ada", last_name: "Lovelace", email_address: "ada@example.com"}` → re-queried status **`ACCEPTED`**.

### 9.4 Failure matrix — anchor-side rejections, all genuine, all via Ferry's own `/api/sep31/transactions`

| # | Scenario | Request | Anchor response | Funds sent | Fix verified |
|---|---|---|---|:---:|---|
| 1 | Unsupported asset | `asset_code=USDC` | `400 {"error":"Asset [USDC] not supported by this mock anchor — only EURC"}` | None | — |
| 2 | Amount too large | `amount=5000` | `400 {"error":"too_large","message":"amount must be between 0.0001 and 1000 EURC"}` | None | — |
| 3 | Amount too small | `amount=0.00001` | `400 {"error":"too_small","message":"amount must be between 0.0001 and 1000 EURC"}` | None | — |
| 4 | **Expired quote (anchor-side)** | `quote_id=mockq_mt1mdkc0f63e`, submitted at `2026-08-20T14:37:38Z` — 10s after its real `2026-08-20T14:37:28.464Z` expiry | `400 {"error":"quote_expired","message":"Quote mockq_mt1mdkc0f63e expired at 2026-08-20T14:37:28.464Z — request a fresh quote before creating a transaction"}` | None | **P0-3** — this exact scenario was listed below (pre-fix) as "not genuinely reproducible against this anchor." It now is, against a different anchor Ferry controls. |

Invalid IBAN and failed-KYC remain not reproducible against *this* anchor either, for the same structural reason as §1–§7's run — see the table below, now spanning both anchors.

### 9.5 SEP-31 transaction created, pending on-chain settlement

```
Transaction ID:      3yx5ul97
stellar_account_id:  GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF
stellar_memo:        3yx5ul97
Required amount:     10 EURC
```

### 9.6 What was NOT completed, and exactly why

**The underpayment and full-payment on-chain legs — the direct P0-1 evidence — are blocked, for the same class of reason §8.3 documented, not a new one.** Acquiring fresh Testnet EURC for this run hit every constraint §8.3 already found, plus one more:

1. Circle's public web faucet (`faucet.circle.com`) hit a browser rate limit on retry.
2. Circle's programmatic faucet API requires Mainnet-verified Circle credentials this environment doesn't have (unchanged from §8.3).
3. **DEX acquisition, checked directly against Horizon at time of writing**: querying the order book in the correct direction (offers *selling* EURC for XLM: `selling_asset=EURC, buying_asset=native`) returns `"asks": []` — zero sellers at any price. The single resting offer visible from the opposite query direction is a *buyer* of EURC, not a seller, and doesn't help. Total liquidity-pool depth remains under 0.04 EURC (`GET /liquidity_pools?reserves=EURC:...`). This is not a pricing problem to work around — there is no path to acquire EURC via the Testnet DEX at all, at any price, right now.

**What this means**: 9.1–9.5 above are genuine, on-chain-verifiable evidence for the P0-3 fix and the full anchor-rejection failure matrix. The P0-1 amount-verification fix has direct proof today only from the unit tests (`mock-anchor/settlement.test.js`, 10/10 passing, including the exact 0.0009/10 EURC case from §8.4) — not yet from a second live on-chain run. Closing this specific gap needs either a successful Circle faucet retry (after its rate-limit window) or a direct transfer from an account that already holds Testnet EURC (e.g. §8.4's sender, if the repo owner still controls it) — both require a human with a funded wallet, the same constraint §8.3 hit originally.

---

## 10. Embedded Mock Anchor — Live Vercel Deployment Run (2026-09-06)

Run against `https://ferry-kappa-ten.vercel.app` — Ferry's own production deployment, acting as its own anchor via `app/api/mock-anchor/*` and `app/.well-known/stellar.toml` (the embedded port of `mock-anchor/`, added this session specifically because `testanchor.stellar.org`'s SEP-31 endpoint is broken and `mock-anchor/`'s own standalone Express process has nowhere to run on Vercel's serverless model — see `GAP_ANALYSIS.md` and `docs/RUNBOOK.md` §2.0.1). Every request below went through Ferry's real `/api/sep{10,12,38,31}/*` orchestrator routes exactly as the browser UI would call them — not the mock anchor's routes directly — so this is evidence for the full stack, not just the mock anchor in isolation.

### 10.1 A real bug found and fixed mid-verification

`stellar.toml`'s endpoint URLs (`WEB_AUTH_ENDPOINT`, `DIRECT_PAYMENT_SERVER`, etc.) were intermittently served wrapped as `[https://ferry-kappa-ten.vercel.app](https://ferry-kappa-ten.vercel.app)/...` instead of a plain URL — confirmed real (not a rendering artifact) via three independent fetch paths returning identical bytes, and via a temporary debug endpoint that echoed the raw environment variable directly. This broke `new URL()` inside SEP-10 challenge resolution (`Invalid URL`), blocking the entire flow. Root cause: `resolveMockAnchorBaseUrl()` used "first truthy env var wins" priority, checking `NEXT_PUBLIC_APP_URL` first — and on this specific deployment, that variable persistently held the corrupted value across multiple dashboard edits, a full deletion, and cache-free rebuilds, for a reason never fully pinned down. Vercel's own automatically-populated `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` and the live request's own `Host` header stayed verified-clean throughout. Fixed by reordering priority to trust the request's own `Host` header first, falling back to Vercel's own variables before an operator-set override (`lib/mockAnchor/config.ts`, `lib/stellar/config.ts` — commit `44938d8`). Verified locally by deliberately reproducing the exact poisoned value and confirming clean resolution, then confirmed live below.

### 10.2 Test account

```
Account:            GBIWJ73HG6WEWHZ5N6S57SIL6UXSTNTSDVY4RTGBL2Q5KVODOAOKHHJY
Friendbot funding:  39b036620f25bbeb0eec4054c36f981fe52b433f5a6a92f2fd5036eee42ce02b
EURC trustline tx:  d2c1465bfcc8441e8453565d2e13172e40540c687cdfb92e18bae2d7e11d94a0
```

Generated and signed by script (not Freighter) for this evidence run, same pattern as §9.1 — secret held only locally, Testnet-only, zero value.

### 10.3 SEP-10 → SEP-38 → SEP-12 → SEP-31, all live through Ferry's own orchestrator against its own embedded anchor

- **SEP-10**: `POST /api/sep10/challenge` (`domain=ferry-kappa-ten.vercel.app`) returned a valid challenge signed by the anchor's own key (`GDEOKXCPI35YJXZ7GSPTBT6CUC6LPECNFUHUWHPFBBW36TK3DI2AQK45`); signed locally and exchanged via `POST /api/sep10/token` for a JWT scoped to the account above.
- **SEP-38 firm quote**: `POST /api/sep38/quote`, `sell_asset=stellar:EURC:GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, `buy_asset=stellar:TRY:<anchor's self-issued TRY, discovered via GET /api/anchor/currencies>`, `sell_amount=10`:
  ```
  Quote ID:    mockq_mtppla3bu3fs
  Rate:        1 EURC = 44.5000000 TRY
  Buy (net):   442.7750000 TRY
  Fee:         0.05 EURC
  Expires at:  2026-09-06T11:13:55.511Z
  ```
- **SEP-12**: `PUT {first_name: "Ada", last_name: "Lovelace", email_address: "ada@example.com"}` → `200 {"id": "GBIWJ73HG6WEWHZ5N6S57SIL6UXSTNTSDVY4RTGBL2Q5KVODOAOKHHJY"}` (accepted).
- **SEP-31 create**: `POST /api/sep31/transactions` (`amount=10`, `asset_code=EURC`, `quote_id=mockq_mtppla3bu3fs`):
  ```
  Transaction ID:      n1gs3n5q
  stellar_account_id:  GDEOKXCPI35YJXZ7GSPTBT6CUC6LPECNFUHUWHPFBBW36TK3DI2AQK45
  stellar_memo_type:   text
  stellar_memo:        n1gs3n5q
  ```

### 10.4 Real on-chain EURC payment, detected and settled — `completed`

```
Stellar transaction hash: 9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6
Ledger:                   4533916
From:                     GBIWJ73HG6WEWHZ5N6S57SIL6UXSTNTSDVY4RTGBL2Q5KVODOAOKHHJY
To:                       GDEOKXCPI35YJXZ7GSPTBT6CUC6LPECNFUHUWHPFBBW36TK3DI2AQK45
Asset:                    EURC (GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO)
Amount:                   10.0000000
Memo:                     n1gs3n5q  (= the SEP-31 transaction id)
successful:               true
Explorer:                 https://stellar.expert/explorer/testnet/tx/9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6
```

The very first status poll after submitting this payment (`GET /api/sep31/transactions?id=n1gs3n5q`, through Ferry's own orchestrator, hitting the embedded anchor's on-demand settlement check — see `lib/mockAnchor/checkSettlement.ts`) returned:

```json
{
  "transaction": {
    "id": "n1gs3n5q",
    "status": "completed",
    "quote_id": "mockq_mtppla3bu3fs",
    "amount": "10.0000000",
    "sender": "GBIWJ73HG6WEWHZ5N6S57SIL6UXSTNTSDVY4RTGBL2Q5KVODOAOKHHJY",
    "received_amount": "10.0000000",
    "stellar_transaction_id": "9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6"
  }
}
```

`received_amount` exactly matches the invoiced `amount`, and `stellar_transaction_id` matches the hash above — confirmed by querying the endpoint directly, not by trusting a log line, same standard as §8.4/§9.5.

**This closes the SEP-31 completion gap this document has tracked since §1**, this time against Ferry's own production Vercel deployment rather than a local process: the full SEP-10 → SEP-38 → SEP-12 → SEP-31 chain, run through Ferry's real orchestrator code against its own embedded anchor, produced one genuine, independently-verifiable, on-chain-settled transfer — checkable by anyone at `https://horizon-testnet.stellar.org/transactions/9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6` or Stellar Expert, indefinitely.

### 10.5 A known limitation, observed directly during this run

Two transient artifacts appeared mid-run, both consistent with — not new instances of a bug beyond — the in-memory-state-per-serverless-instance limitation `lib/mockAnchor/state.ts`'s own docstring already flags: a standalone verification `GET /api/sep12/customer` call briefly reported `NEEDS_INFO` immediately after a successful `PUT` (a different, colder Vercel function instance not yet holding that record), and a separate standalone status poll returned `404 Transaction not found` for the same reason. Neither affected the actual flow above — the `PUT`/create/payment-poll sequence documented in §10.3–§10.4 landed on consistent instances throughout, and this is the expected result for a real user's single browser session (`TransferPanel.tsx` polls the same way, a few seconds apart, for the entire proximate flow). Recorded here rather than smoothed over, same standard as the rest of this document.

---

## 11. Mock Anchor Re-Run at 55.35 TRY/EURC (2026-10-08)

Run against Ferry's standalone mock anchor (`mock-anchor/`, `localhost:4001`) through Ferry's real `/api/sep{10,12,38,31}/*` routes (Next.js dev server, `localhost:3000`), after changing the mock anchor's fixed illustrative rate from 44.5 to 55.35 TRY/EURC (`mock-anchor/server.js` and `lib/mockAnchor/config.ts`, `MOCK_EURC_TRY_RATE`). Fee unchanged at 0.5% of the sell amount; quote validity unchanged at 5 minutes. Same standard as §1–§10: every hash below was read back from Horizon Testnet after the run.

### 11.1 Setup

```
Sender:              GCNAYI4LKBYBGXWYK737H3GNETLCPO5ZAUCIZ3MLFG2RL2ACO2DJMLGN  (new, script-generated; secret held only locally, Testnet-only)
Friendbot funding:   d1c95ace3dc77800466a3dda0937cfe2a4214ef799233993a12004d20ba1c990  (ledger 5091557)
EURC trustline:      d93135192fec894c6b76bad0b9f94ed3334203d80fd2841b40953db744f63947  (ledger 5091558)
EURC funding:        7e775bb98c7abca2f6943d434c42b90fa5f7da4d3a88aead77e8525e55d0090f  (ledger 5091559, 8.5 EURC)
```

**Disclosure on the EURC funding:** Testnet EURC still cannot be acquired automatically (§8.3, §9.6), so the sender's 8.5 EURC came from the mock anchor's own receiving account (`GBDODNXHPROEII5UX3T23GOLDD53XMDQHNLDXEFHIL2CIPPXFHXTGHAF`, signed with `mock-anchor/.env`'s `SIGNING_SECRET` — Ferry's own test infrastructure), which held EURC from earlier runs. The transfers below therefore pay EURC back to the account it came from. This does not affect what the run demonstrates (the orchestration flow, memo/amount matching, settlement and payout), but it is stated here rather than left implicit.

SEP-10 token obtained via `/api/sep10/challenge` + `/api/sep10/token` (challenge signed locally with the sender key). SEP-12 `PUT` returned `{"id": "GCNAYI4L..."}`; `GET` returned `ACCEPTED`.

### 11.2 Transfers

| | A | B | C |
|---|---|---|---|
| SEP-38 quote | `mockq_muztre00zw4o` | `mockq_muztrnlwxarm` | `mockq_muztrvhzp4d1` |
| Sell / fee / price | 5 EURC / 0.025 / 55.35 | 2.5 EURC / 0.0125 / 55.35 | 1 EURC / 0.005 / 55.35 |
| Net buy (quoted) | 275.3662500 TRY | 137.6831250 TRY | 55.0732500 TRY |
| Quote expires | 2026-10-08T17:48:03.072Z | 2026-10-08T17:48:15.524Z | 2026-10-08T17:48:25.751Z |
| SEP-31 tx id / memo | `3lfeapkd` | `hge71rtb` | `fcj4s1b0` |
| EURC payment hash | `99389e9daf565ee4beb1f78a76e2beb429b9c8abdbfd2e167acdf237184ee561` | `58ce0f347152d8f7343b79d3a4826e89848e909e351b9a904286f47790322e57` | `bd7c7f1aead32408fc0f64517f6e1f68c3515f29caf6a10c1acebcdffe580db8` |
| Payment ledger / time | 5091560 / 17:43:07Z | 5091562 / 17:43:17Z | 5091565 / 17:43:32Z |
| Demo TRY payout hash | `3aeadf53ac16499207705ab1afb761c89ed30f5c78c40b08269ce4ed63ba9a92` | `51681c89a276cc73964053094bd6db5ac8fe6daa4521890aebc38cac68f1c38a` | `f265bc3a88179610a333238c04498240257cd724e998feeb29f2b83c0dd811ec` |
| Payout ledger / time / amount | 5091561 / 17:43:12Z / 275.3662500 TRY | 5091563 / 17:43:22Z / 137.6831250 TRY | 5091566 / 17:43:37Z / 55.0732500 TRY |
| Final status (via `GET /api/sep31/transactions`) | `completed`, `received_amount` 5.0000000 | `completed`, `received_amount` 2.5000000 | `completed`, `received_amount` 1.0000000 |

Check: net buy = (sell − fee) × 55.35 → 4.975 × 55.35 = 275.36625; 2.4875 × 55.35 = 137.683125; 0.995 × 55.35 = 55.07325. Each payout amount on-chain equals the quoted net buy exactly. The demo payout recipient is the `MOCK_PAYOUT_DEMO_ACCOUNT` from §8 (`GCWF5ZQBC6P4YFTM5TKYOC3KVGOENITGCNC2KZMYYPJQIL7H34HZ2TWN`); as in §8.4, this payout is a demonstration artifact, not how a real SEP-31 payout works.

---

## Failure scenarios requested but not genuinely reproducible against this anchor

Being direct about this rather than inventing results:

| Requested scenario | Outcome | Why |
|---|---|---|
| **Failed KYC** | Not reproducible | Submitted deliberately malformed data (empty `first_name`/`last_name`, invalid email format) — the reference anchor performed no field-level validation and returned `ACCEPTED` anyway. This anchor's SEP-12 implementation is a minimal demo; it doesn't reject on data quality. |
| **Invalid IBAN** | Not reproducible | Ferry has no client-side IBAN format validator (not yet built), and this anchor's `bank_account_number` field is an unvalidated free-text string — it accepts any value. Reproducing this scenario requires either building IBAN format validation into Ferry itself, or testing against an anchor with real bank-detail validation. |
| **Expired quote, rejected by the anchor** | ~~Not reproducible~~ **Closed, against a different anchor — see §9.4 row 4** | True against *this* anchor (`testanchor.stellar.org`): it ignores `expire_after` and always returns the same fixed `2026-08-14T12:00:00Z` cutoff. Ferry's mock anchor (`mock-anchor/`) was fixed on 2026-08-20 to enforce `expires_at` server-side, and a genuine anchor-side `quote_expired` rejection is now on record in §9.4. |
| **Refund** | Not attempted | Requires a human to complete the anchor's hosted SEP-24 form (§5) and the anchor to subsequently reverse a completed transaction — both outside what's automatable via API calls alone. |

**What this means in practice:** Ferry's request/response plumbing, error typing, and client-side guardrails (quote expiry, trustline pre-flight) are real and verified end-to-end. The specific business-rule rejections above depend on anchor-side behavior that the public Stellar reference anchor doesn't implement strictly enough to exercise. A production pilot anchor with real KYC/IBAN validation would be needed to capture genuine evidence for those rows — and that evidence should be gathered the same way this document was: by actually running the transactions, not writing plausible outcomes.

---

*Every identifier above is independently verifiable: Stellar transaction hashes against `https://horizon-testnet.stellar.org`, §1–§7's anchor-issued IDs and JWTs against `testanchor.stellar.org` directly. §8's mock-anchor-issued IDs and JWT are only re-checkable by running `mock-anchor/` yourself (it's not a persistently-hosted service) — the on-chain trustline hashes in §8.1 remain checkable by anyone at any time, same as any other Stellar Testnet transaction.*
