# Ferry — Key Management & Secret Handling

**Document type:** Mainnet Readiness Pack, part 3 of 4 (SOW Deliverable 3). See also `RUNBOOK.md`, `REFUND_AND_INCIDENT_PROCEDURES.md`, `GO_LIVE_CHECKLIST.md` in this directory.
**Scope:** what key material and secrets exist in Ferry's current architecture, how each is handled, and what would need to change if that scope ever grows.

---

## 1. What's true today: Ferry holds no signing keys

Ferry never holds a Stellar private key at any point. Every transaction Ferry's UI needs signed — the SEP-10 challenge, a `ChangeTrust` operation for a SEP-24 deposit — is built client-side and handed to the user's own Freighter browser extension via `signTransaction()` (`@stellar/freighter-api`), which performs the actual signing inside the extension's own isolated context. Ferry's code only ever sees the resulting signed XDR string, confirmed directly in the call sites:

- `components/RemittanceFlow.tsx`: `signTransaction(challenge.transaction, { networkPassphrase, address: publicKey })` — no key material passed in, only the passphrase and the public address.
- `components/TransferPanel.tsx`: the same pattern for the `ChangeTrust` trustline-establishment flow (`buildChangeTrustXdr` → `signTransaction` → `submitSignedTransaction`).

There is **no Ferry-controlled key of any kind** in the current architecture — not a hot wallet, not a cold wallet, not an automation/service-account signing key, nothing. `grep -rni "secret\|private.?key\|seed" --include="*.ts" --include="*.tsx" lib app components` (excluding this documentation and comments describing this exact policy) returns no code path that reads, stores, or transmits one. This is enforced by construction, not by a policy someone could accidentally violate in a hurry — there is simply no field, no env var, and no code path where a secret key would go.

**Consequence:** the traditional key-management concerns — HSM custody, multisig thresholds, key rotation schedules, hot/cold wallet segregation — **do not apply to Ferry's current architecture**, as long as it remains a pure orchestrator. Section 3 below covers what would need to be decided if that scope ever changes; asserting a custody policy for keys that don't exist would be inventing content this document is specifically trying not to do (see `CLAUDE.md`'s non-custodial architecture mandate and `GAP_ANALYSIS.md`'s general approach to unfilled placeholders).

## 2. Secrets that do exist, and how they're handled

Not all "key management" is about signing keys. Three other kinds of secret-shaped values exist in this codebase:

| Secret | What it is | Where it lives | Handling |
|---|---|---|---|
| SEP-10 session JWT | A bearer token proving the connected wallet completed SEP-10 auth with a given anchor | Client-side React state only (`sep10Token` in `app/page.tsx`) | Never persisted (no `localStorage`, no cookie) — lost on refresh by design. Never logged: `lib/logger.ts` only ever receives route/status/timing metadata, never request bodies or headers. |
| Recipient claim link's embedded token | The *sender's* SEP-10 token, embedded in the query string of a shared `/claim/[id]` URL (`components/TransferPanel.tsx`'s `recipientLink()`) | URL query string, visible to anyone with the link, and to any service that logs full URLs (browser history, some proxies/CDNs) | **Known, stated limitation** (`app/claim/[id]/page.tsx`'s own comment): a production version should mint a short-lived, receiver-scoped credential server-side instead of passing the sender's own session token through a URL. This Testnet prototype has no backend session store to mint one, so it doesn't do that yet — tracked as a go-live item below. |
| KYC field values (name, IBAN, bank details) | Personally identifying / financial data, not a cryptographic secret, but sensitive in the same way | Relayed through `/api/sep12/customer` straight to the anchor's own `KYC_SERVER`; never written to a database (there isn't one) | `lib/apiInstrumentation.ts`'s structured logging explicitly logs only route/status/timing/error metadata — field *values* are never included in a log line, by construction of what gets passed to `logger.info()`. |
| `.env.local` values (anchor domains, Horizon URL, etc.) | Configuration, not secret in the traditional sense — no API keys or credentials are currently required by any integration | `.env.local`, gitignored; `.env.local.example` documents the shape without real values | No rotation needed today since nothing here is a credential. If a future anchor integration requires an API key (e.g. a private SEP-38 quote feed), it must go through env vars the same way, never a hardcoded literal — `CLAUDE.md`'s explicit instruction. |

## 3. If Ferry's scope changes to hold key material

This section only becomes non-trivial if a future feature requires Ferry itself to hold a signing key — e.g. an automation service that needs to co-sign, or a custodial feature explicitly out of scope for the current non-custodial design. If that never happens, the honest answer stays "not applicable," and that decision should be recorded explicitly (see table below) rather than left ambiguous by omission.

| Item | Owner | Decision |
|---|---|---|
| Will Ferry ever hold a signing key (e.g. for automation, a future custodial feature)? | `[ ]` | `[ ]` — if "no," record that decision explicitly with a date, rather than leaving this section merely unanswered |
| If yes: custody model (HSM, MPC, multisig threshold) | `[ ]` | `[ ]` |
| If yes: key generation and initial custody handoff procedure | `[ ]` | `[ ]` |
| If yes: key rotation policy and cadence | `[ ]` | `[ ]` |
| If yes: who has access, under what approval process, and how access is revoked on personnel change | `[ ]` | `[ ]` |
| If yes: incident procedure for suspected key compromise | `[ ]` | `[ ]` |

## 4. Adjacent items that belong here even though they're not "keys"

| Item | Owner | Decision |
|---|---|---|
| SEP-10 JWT signing key custody — this belongs to each **anchor**, not Ferry; confirm each contracted anchor's own key management meets Ferry's risk bar before relying on its tokens | `[ ]` | `[ ]` |
| Recipient claim link session-token limitation (§2 above) — replace with a server-minted, receiver-scoped credential before Mainnet, once a backend session store exists to mint one from | `[ ]` | `[ ]` |
| Migrate `sep10Token` from in-memory React state to an `HttpOnly` cookie / BFF session pattern, if the XSS-exfiltration risk of the current approach is unacceptable at Mainnet transaction values (`GAP_ANALYSIS.md`'s prior security review flagged this) | `[ ]` | `[ ]` |

---

*Section 1 is a fact about the current codebase, verifiable by reading the cited call sites — it is not a policy that could lapse through inattention, since there is no key-holding code path to begin with. Sections 3 and 4 are the genuinely open parts of this document.*
