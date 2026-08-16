"use strict";

/**
 * Ferry mock anchor — a minimal SEP-1/10/12/38/31 server for the TRY side
 * of the EURC -> TRY corridor test, since no public TRY-issuing anchor
 * exists on Stellar Testnet. This is NOT a production anchor
 * implementation (no real KYC, no real banking rails, no persistence) —
 * see README.md for exactly what it does and does not simulate.
 *
 * Config is entirely environment variables (never hardcoded secrets, per
 * this repo's CLAUDE.md instruction). If the three secret vars below are
 * unset, this process generates and Friendbot-funds fresh Testnet
 * keypairs at startup and prints them once — save them into a local
 * .env (gitignored) if you want the same anchor identity across restarts.
 */

require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon,
  Memo,
  WebAuth,
} = require("@stellar/stellar-sdk");

const PORT = Number(process.env.PORT || 4001);
const HOME_DOMAIN = process.env.HOME_DOMAIN || `localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "ferry-mock-anchor-dev-secret-not-for-production";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const HORIZON_URL = "https://horizon-testnet.stellar.org";

// The one non-mock ingredient here: Circle's real EURC issuer on Stellar
// Testnet, verified independently (Circle's own developer docs, plus
// on-chain corroboration — home_domain=circle.com, ~2,500 trustlines,
// billions in authorized supply — see CORRIDOR_VERIFICATION.md §5).
const EURC_ISSUER = "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO";

// Illustrative, fixed mock rate — not a live FX feed. Stated plainly so
// nobody mistakes this for a real quoted market rate.
const MOCK_EURC_TRY_RATE = 44.50;

const server = new Horizon.Server(HORIZON_URL);

async function loadOrGenerateKeypair(envVar, label) {
  const secret = process.env[envVar];
  if (secret) return Keypair.fromSecret(secret);

  const kp = Keypair.random();
  console.log(`[mock-anchor] ${envVar} not set — generated a fresh ${label} keypair:`);
  console.log(`[mock-anchor]   public:  ${kp.publicKey()}`);
  console.log(`[mock-anchor]   secret:  ${kp.secret()}  (save this in mock-anchor/.env to reuse it)`);
  const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!res.ok) {
    console.warn(`[mock-anchor]   WARNING: Friendbot funding failed for ${label} (${res.status}) — fund it manually.`);
  } else {
    console.log(`[mock-anchor]   funded via Friendbot.`);
  }
  return kp;
}

// In-memory only — this is a mock anchor, not a durable service. Restarting
// the process forgets every customer, quote, and transaction, same
// intentional non-goal as Ferry's own lib/idempotency.ts / auditTrail.ts.
const customers = new Map(); // account -> { status, fields }
const quotes = new Map(); // quote id -> { sell_asset, buy_asset, sell_amount, buy_amount, price, expires_at }
const transactions = new Map(); // tx id -> { status, quote_id, amount, sender, stellar_transaction_id?, payout_stellar_transaction_id? }

const SENDER_FIELDS = {
  first_name: { type: "string", description: "Sender's first name" },
  last_name: { type: "string", description: "Sender's last name" },
  email_address: { type: "string", description: "Sender's email address", optional: true },
};

const RECEIVER_FIELDS = {
  first_name: { type: "string", description: "Recipient's first name" },
  last_name: { type: "string", description: "Recipient's last name" },
  bank_name: { type: "string", description: "Recipient's bank name", optional: true },
  bank_account_number: { type: "string", description: "Recipient's IBAN" },
};

function requireBearerAccount(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.sub;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
}

/**
 * The receiving account can't accept a SEP-31 sender's EURC payment without
 * first trusting the asset — a real anchor's own onboarding would set this
 * up once, out of band. Found live: a run got all the way through SEP-10 →
 * SEP-38 → SEP-12 → SEP-31 creation before the sender's payment failed with
 * `op_no_trust`, because this had never been established for this account.
 * Checked and fixed idempotently on every boot so it can't recur — cheap
 * (one Horizon read, and a ChangeTrust submit only when actually missing).
 */
async function ensureTrustline(keypair, asset, label) {
  const account = await server.loadAccount(keypair.publicKey());
  const alreadyTrusts = account.balances.some(
    (b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer()
  );
  if (alreadyTrusts) return;

  console.log(`[mock-anchor] ${label} has no ${asset.getCode()} trustline yet — establishing one...`);
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  const res = await server.submitTransaction(tx);
  console.log(`[mock-anchor] ${label} ${asset.getCode()} trustline established: ${res.hash}`);
}

async function main() {
  const signingKeypair = await loadOrGenerateKeypair("SIGNING_SECRET", "SEP-10 signing / receiving account");
  const tryIssuerKeypair = await loadOrGenerateKeypair("TRY_ISSUER_SECRET", "mock TRY issuer");
  const TRY = new Asset("TRY", tryIssuerKeypair.publicKey());

  await ensureTrustline(signingKeypair, new Asset("EURC", EURC_ISSUER), "receiving account");

  // Optional, off by default: an account to send a small demonstrative
  // TRY-asset payment to once a transaction completes. Real SEP-31 payouts
  // are a bank wire with no Stellar leg at all — this exists ONLY so a
  // verification run has a second, independently checkable testnet tx
  // hash for the "payout" side. See README.md "What's real vs. simulated".
  const payoutDemoAccount = process.env.MOCK_PAYOUT_DEMO_ACCOUNT || null;

  const app = express();
  app.use(express.json());

  // ---- SEP-1: stellar.toml ----
  app.get("/.well-known/stellar.toml", (req, res) => {
    res.type("text/plain").send(`VERSION="2.7.0"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE}"
SIGNING_KEY="${signingKeypair.publicKey()}"
WEB_AUTH_ENDPOINT="http://${HOME_DOMAIN}/auth"
DIRECT_PAYMENT_SERVER="http://${HOME_DOMAIN}/sep31"
ANCHOR_QUOTE_SERVER="http://${HOME_DOMAIN}/sep38"
KYC_SERVER="http://${HOME_DOMAIN}/sep12"

[DOCUMENTATION]
ORG_NAME="Ferry mock anchor (local test harness)"
ORG_DESCRIPTION="Not a licensed anchor. Simulates the TRY leg of a EUR(EURC)->TRY corridor for Testnet-only development. See mock-anchor/README.md."

[[CURRENCIES]]
code="EURC"
issuer="${EURC_ISSUER}"
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="EUR"
desc="Circle's real EURC on Stellar Testnet — see CORRIDOR_VERIFICATION.md for issuer verification."

[[CURRENCIES]]
code="TRY"
issuer="${tryIssuerKeypair.publicKey()}"
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="TRY"
desc="MOCK / SIMULATED representation of Turkish Lira. Not backed by any bank, not a real anchor. Exists only so this local test harness has a Stellar asset to quote and (optionally) demonstrate a payout with."
`);
  });

  // ---- SEP-10: Web Authentication ----
  app.get("/auth", (req, res) => {
    const account = req.query.account;
    if (!account) return res.status(400).json({ error: "`account` is required" });
    try {
      const transaction = WebAuth.buildChallengeTx(
        signingKeypair,
        account,
        HOME_DOMAIN,
        300,
        NETWORK_PASSPHRASE,
        HOME_DOMAIN
      );
      res.json({ transaction, network_passphrase: NETWORK_PASSPHRASE });
    } catch (err) {
      res.status(400).json({ error: `Failed to build challenge: ${err.message}` });
    }
  });

  app.post("/auth", (req, res) => {
    const { transaction } = req.body || {};
    if (!transaction) return res.status(400).json({ error: "`transaction` is required" });
    try {
      const { clientAccountID } = WebAuth.readChallengeTx(
        transaction,
        signingKeypair.publicKey(),
        NETWORK_PASSPHRASE,
        HOME_DOMAIN,
        HOME_DOMAIN
      );
      // Simplification, stated plainly: a full SEP-10 implementation
      // verifies the submitted transaction is actually signed by
      // clientAccountID (or its configured signers) with sufficient
      // weight. This mock trusts readChallengeTx's structural validation
      // (right domain, right server key, right timebounds, correctly
      // shaped) without re-deriving on-chain signer thresholds — adequate
      // for a local Testnet-only harness, not for a real anchor.
      const token = jwt.sign({ sub: clientAccountID, iss: HOME_DOMAIN }, JWT_SECRET, { expiresIn: "1h" });
      res.json({ token });
    } catch (err) {
      res.status(400).json({ error: `Invalid challenge transaction: ${err.message}` });
    }
  });

  // ---- SEP-38: Anchor RFQ (quotes) ----
  app.get("/sep38/price", (req, res) => {
    const { sell_asset, buy_asset, sell_amount, buy_amount } = req.query;
    if (!sell_asset || !buy_asset || (!sell_amount && !buy_amount)) {
      return res.status(400).json({ error: "sell_asset, buy_asset and one of sell_amount/buy_amount are required" });
    }
    if (sell_asset !== `stellar:EURC:${EURC_ISSUER}` || buy_asset !== `stellar:TRY:${tryIssuerKeypair.publicKey()}`) {
      return res.status(404).json({ error: "sell_asset or buy_asset not found — this mock anchor only quotes EURC -> TRY" });
    }
    const sellAmt = sell_amount ? Number(sell_amount) : Number(buy_amount) / MOCK_EURC_TRY_RATE;
    const buyAmt = sell_amount ? Number(sell_amount) * MOCK_EURC_TRY_RATE : Number(buy_amount);
    const fee = (sellAmt * 0.005).toFixed(7);
    res.json({
      price: MOCK_EURC_TRY_RATE.toFixed(7),
      sell_amount: sellAmt.toFixed(7),
      buy_amount: (buyAmt - Number(fee) * MOCK_EURC_TRY_RATE).toFixed(7),
      fee: { total: fee, asset: `stellar:EURC:${EURC_ISSUER}`, details: [{ name: "Mock anchor fee", amount: fee }] },
    });
  });

  app.post("/sep38/quote", (req, res) => {
    const account = requireBearerAccount(req, res);
    if (!account) return;
    const { sell_asset, buy_asset, sell_amount, buy_amount } = req.body || {};
    if (sell_asset !== `stellar:EURC:${EURC_ISSUER}` || buy_asset !== `stellar:TRY:${tryIssuerKeypair.publicKey()}`) {
      return res.status(404).json({ error: "sell_asset or buy_asset not found — this mock anchor only quotes EURC -> TRY" });
    }
    const sellAmt = sell_amount ? Number(sell_amount) : Number(buy_amount) / MOCK_EURC_TRY_RATE;
    const fee = (sellAmt * 0.005).toFixed(7);
    const buyAmt = (sellAmt * MOCK_EURC_TRY_RATE - Number(fee) * MOCK_EURC_TRY_RATE).toFixed(7);
    const id = `mockq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const quote = {
      id,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      price: MOCK_EURC_TRY_RATE.toFixed(7),
      sell_asset,
      buy_asset,
      sell_amount: sellAmt.toFixed(7),
      buy_amount: buyAmt,
      fee: { total: fee, asset: sell_asset, details: [{ name: "Mock anchor fee", amount: fee }] },
    };
    quotes.set(id, quote);
    res.json(quote);
  });

  // ---- SEP-12: Customer Info ----
  app.get("/sep12/customer", (req, res) => {
    const account = requireBearerAccount(req, res);
    if (!account) return;
    const type = req.query.type;
    const existing = customers.get(account);
    if (existing) return res.json(existing);
    const fields = type === "sep31-receiver" ? RECEIVER_FIELDS : SENDER_FIELDS;
    res.json({ status: "NEEDS_INFO", fields });
  });

  app.put("/sep12/customer", (req, res) => {
    const account = requireBearerAccount(req, res);
    if (!account) return;
    // Mock only: accepts anything and marks it ACCEPTED immediately. No
    // real verification happens here — see README.md.
    customers.set(account, { status: "ACCEPTED", id: account });
    res.json({ id: account });
  });

  // ---- SEP-31: Direct Payments ----
  app.get("/sep31/info", (req, res) => {
    res.json({
      receive: {
        EURC: {
          enabled: true,
          min_amount: 1,
          max_amount: 100000,
          fields: { transaction: { quote_id: { description: "SEP-38 quote id" } } },
        },
      },
    });
  });

  app.post("/sep31/transactions", (req, res) => {
    const account = requireBearerAccount(req, res);
    if (!account) return;
    const { amount, asset_code, quote_id } = req.body || {};
    if (asset_code !== "EURC") {
      return res.status(400).json({ error: `Asset [${asset_code}] not supported by this mock anchor — only EURC` });
    }
    const customer = customers.get(account);
    if (!customer || customer.status !== "ACCEPTED") {
      return res.status(400).json({ error: "Sender KYC not accepted — complete SEP-12 first" });
    }
    const quote = quote_id ? quotes.get(quote_id) : null;
    const id = Math.random().toString(36).slice(2, 10); // short — fits as a Stellar text memo
    transactions.set(id, {
      id,
      status: "pending_receiver",
      quote_id,
      amount: quote ? quote.sell_amount : amount,
      sender: account,
      created_at: new Date().toISOString(),
    });
    console.log(`[mock-anchor] SEP-31 transaction ${id} created for ${account}, expecting EURC payment with memo "${id}"`);
    res.json({
      id,
      stellar_account_id: signingKeypair.publicKey(),
      stellar_memo_type: "text",
      stellar_memo: id,
    });
  });

  app.get("/sep31/transactions/:id", (req, res) => {
    const account = requireBearerAccount(req, res);
    if (!account) return;
    const tx = transactions.get(req.params.id);
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    res.json({ transaction: tx });
  });

  app.get("/health", (req, res) =>
    res.json({ ok: true, home_domain: HOME_DOMAIN, signing_key: signingKeypair.publicKey(), try_issuer: tryIssuerKeypair.publicKey() })
  );

  app.listen(PORT, () => {
    console.log(`[mock-anchor] listening on http://${HOME_DOMAIN}`);
    console.log(`[mock-anchor] SEP-10 signing / EURC receiving account: ${signingKeypair.publicKey()}`);
    console.log(`[mock-anchor] mock TRY issuer: ${tryIssuerKeypair.publicKey()}`);
  });

  // ---- Background: watch for the expected incoming EURC payment ----
  // A real anchor's own payment-processing service does exactly this kind
  // of ledger-watching (usually via Horizon's streaming API); a simple
  // poll is adequate for a local, single-instance mock.
  setInterval(async () => {
    const pending = [...transactions.values()].filter((t) => t.status === "pending_receiver");
    if (pending.length === 0) return;
    try {
      const payments = await server
        .payments()
        .forAccount(signingKeypair.publicKey())
        .order("desc")
        .limit(20)
        .call();
      for (const tx of pending) {
        const match = payments.records.find(
          (p) =>
            p.type === "payment" &&
            p.to === signingKeypair.publicKey() &&
            p.asset_code === "EURC" &&
            p.asset_issuer === EURC_ISSUER
        );
        if (!match) continue;
        // Text memo isn't on the payment operation record itself — fetch
        // the parent transaction to check it actually targets this tx id.
        const parentTx = await match.transaction();
        if (parentTx.memo !== tx.id) continue;

        tx.status = "completed";
        tx.stellar_transaction_id = match.transaction_hash;
        console.log(`[mock-anchor] transaction ${tx.id} matched EURC payment ${match.transaction_hash}`);

        if (payoutDemoAccount) {
          try {
            const issuerAccount = await server.loadAccount(tryIssuerKeypair.publicKey());
            const payoutTx = new TransactionBuilder(issuerAccount, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
              .addOperation(
                Operation.payment({
                  destination: payoutDemoAccount,
                  asset: TRY,
                  amount: quotes.get(tx.quote_id)?.buy_amount || "1",
                })
              )
              .addMemo(Memo.text(tx.id))
              .setTimeout(60)
              .build();
            payoutTx.sign(tryIssuerKeypair);
            const payoutRes = await server.submitTransaction(payoutTx);
            tx.payout_stellar_transaction_id = payoutRes.hash;
            console.log(`[mock-anchor] demo TRY payout for ${tx.id} sent: ${payoutRes.hash}`);
          } catch (err) {
            console.warn(`[mock-anchor] demo TRY payout failed for ${tx.id}:`, err.response ? JSON.stringify(err.response.data) : err.message);
          }
        }
      }
    } catch (err) {
      console.warn("[mock-anchor] payment poll failed:", err.message);
    }
  }, 5000);
}

main().catch((err) => {
  console.error("[mock-anchor] fatal startup error:", err);
  process.exit(1);
});
