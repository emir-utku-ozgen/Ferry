import { resolveAnchorToml } from "./toml";
import { anchorFetch, assertAnchorOk } from "./anchorFetch";
import { AnchorError } from "./anchorError";

/**
 * SEP-38: Anchor RFQ (quote) API.
 *
 * Powers Ferry's rate calculator: an indicative price can be fetched
 * without authentication, while a firm, executable quote (used to lock a
 * rate before a SEP-24/31 transfer) requires a SEP-10 token.
 */

export interface IndicativePriceParams {
  sell_asset: string;
  buy_asset: string;
  sell_amount?: string;
  buy_amount?: string;
  // Per SEP-38, an anchor advertises which of these it supports in its
  // stellar.toml / GET /info response — not every anchor supports all three.
  context: "sep6" | "sep31" | "sep24";
}

export interface IndicativePriceResponse {
  price: string;
  sell_amount: string;
  buy_amount: string;
}

export interface FirmQuoteRequest extends IndicativePriceParams {
  expire_after?: string;
}

export interface FirmQuoteResponse {
  id: string;
  expires_at: string;
  price: string;
  sell_asset: string;
  buy_asset: string;
  sell_amount: string;
  buy_amount: string;
}

async function quoteServer(domain: string): Promise<string> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.anchorQuoteServer) {
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor "${domain}" does not advertise an ANCHOR_QUOTE_SERVER (SEP-38 unsupported)`
    );
  }
  return toml.anchorQuoteServer;
}

export async function getIndicativePrice(
  domain: string,
  params: IndicativePriceParams
): Promise<IndicativePriceResponse> {
  const base = await quoteServer(domain);
  const url = new URL(`${base}/price`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, value);
  });

  const context = `SEP-38 price request to "${domain}"`;
  const res = await anchorFetch(url.toString(), {}, context);
  await assertAnchorOk(res, context);
  return res.json();
}

export async function postFirmQuote(
  domain: string,
  token: string,
  payload: FirmQuoteRequest
): Promise<FirmQuoteResponse> {
  const base = await quoteServer(domain);
  const context = `SEP-38 firm quote request to "${domain}"`;
  const res = await anchorFetch(
    `${base}/quote`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    context
  );
  await assertAnchorOk(res, context);
  return res.json();
}
