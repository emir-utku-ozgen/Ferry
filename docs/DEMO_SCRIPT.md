# Ferry — Recorded Demo Script

**Document type:** SOW Deliverable 3 evidence — "recorded E2E demo video (non-technical user completing transfer in <10 min)."
**Scope:** an exact, timed walkthrough script for recording that demo. Assumes the deployment in `docs/RUNBOOK.md` §2.2 is live and the sender wallet already holds Testnet EURC (see "Before you hit record" below) — a live demo should never wait on a faucet.

---

## Before you hit record

- [ ] Ferry deployed and reachable at its public URL (`docs/RUNBOOK.md` §2.2), or running locally at `localhost:3000` with `mock-anchor/` at `localhost:4001`
- [ ] Freighter installed, unlocked, set to **Testnet**, and already holding a small XLM balance for fees/reserves
- [ ] The sender wallet already holds **real Testnet EURC** — get this *before* recording (Circle's faucet, or a transfer from an already-funded account); waiting on a faucet live on camera breaks the <10 min budget and isn't representative of the product
- [ ] A second browser profile/window ready for the recipient's claim-link step, so the "two different people" nature of the flow is visible rather than reusing one tab
- [ ] Screen recording software running, resolution ≥1080p, browser zoomed so text is legible

## Script

| Time | Action | What to say |
|---|---|---|
| 0:00–0:20 | Show the Ferry landing page. Point at the "Testnet" badge and the non-custodial notice. | "This is Ferry — a EUR-to-Turkish-Lira remittance app built on Stellar. It never holds funds or identity documents; everything settles directly between the sender, the anchor, and the recipient. This is a Testnet demo — no real money moves." |
| 0:20–1:00 | Click **Connect Wallet**. Approve the Freighter connection prompt. Wallet address appears connected. | "The sender connects their own wallet — Freighter here — and signs a SEP-10 challenge to authenticate. Ferry never sees a private key, only the signed result." |
| 1:00–2:15 | Enter a sell amount (e.g. `10` EURC) in the quote calculator. Show the indicative price updating. Click **Lock Rate**. | "Before committing anything, the sender sees exactly what the recipient will receive — this is a firm, anchor-guaranteed quote, not an estimate. Once I lock it, that net TRY amount and the rate are fixed until the quote expires." |
| 2:15–2:30 | Point at the fee breakdown and the countdown/expiry indicator. | "The fee is itemized, and the quote has a visible expiry — if it lapses, Ferry blocks sending automatically rather than risking a stale rate." |
| 2:30–3:30 | Open the KYC modal, fill the sender's required fields, submit. Status flips to **ACCEPTED**. | "The sender completes their own KYC here — this is relayed straight to the anchor's own verification service. Ferry never stores this data." |
| 3:30–4:15 | Click **Copy recipient link**. Switch to the second browser window, paste the link, open it. | "Now I generate a link for the recipient — someone with no Stellar wallet and no Ferry account at all." |
| 4:15–5:15 | On the claim page: enter recipient name + a valid IBAN, submit. Status flips to **ACCEPTED**. | "The recipient enters their name and IBAN — validated client-side against the real IBAN checksum, not just a length check — and it's relayed to the anchor's own KYC service, same as the sender's." |
| 5:15–6:00 | Back on the sender's window: click **Send**. If prompted, establish the EURC trustline (Freighter signs a `ChangeTrust`). Show the returned deposit instructions (`stellar_account_id`, memo). | "This creates the actual transfer request with the anchor and gets back a Stellar address and a memo — that memo is critical, it's how the anchor matches the incoming payment to this specific transfer." |
| 6:00–7:00 | Approve the EURC payment in Freighter (amount + memo pre-filled by Ferry). Submit. | "The sender's wallet signs and submits the one on-chain payment in this whole flow — Ferry itself never touches the funds." |
| 7:00–8:30 | Watch the status tracker: **Settling (Stellar Testnet)** → polling live → **Completed / Delivered**. Point at the live audit trail underneath. | "Ferry polls the anchor every few seconds. Once the anchor's own poller detects the payment and confirms the amount matches what was invoiced, the transfer flips to completed — live, not simulated." |
| 8:30–9:15 | Click through to the Stellar Testnet Explorer link for the settlement transaction hash. Show it resolving to a real, independently-verifiable transaction. | "This hash is checkable by anyone, forever, independent of whether Ferry or this anchor are even still running." |
| 9:15–9:45 | Return to Ferry. Briefly show one designed error screen (e.g. reload with an expired quote, or reference the failure matrix). | "Every failure mode — anchor rejection, failed KYC, invalid IBAN, expired quote — has its own designed screen with a clean-refund explanation, not a dead end. Full evidence for those is in the repo's TESTNET_HASHES.md." |
| 9:45–10:00 | Close on the landing page. | "That's Ferry end-to-end on Stellar Testnet — firm quotes, non-custodial KYC, and a real settled transfer, in under ten minutes." |

## After recording

- [ ] Trim dead air around the Freighter approval prompts (they're often slower than the rest of the flow)
- [ ] Caption or verbally state the settlement transaction hash on-screen for at least 3 seconds — it's the single most-checkable claim in the video
- [ ] Upload and link it from `README.md` and `TESTNET_HASHES.md`'s relevant run section
- [ ] Update `GO_LIVE_CHECKLIST.md` §3 once linked
