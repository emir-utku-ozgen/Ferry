import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep38/*` orchestrator routes. */

export interface IndicativePrice {
  price: string;
  sell_amount: string;
  buy_amount: string;
}

export async function fetchIndicativePrice(
  domain: string,
  params: { sell_asset: string; buy_asset: string; sell_amount: string; context: "sep6" | "sep31" | "sep24" }
): Promise<IndicativePrice> {
  const query = new URLSearchParams({ domain, ...params });
  const res = await fetch(`/api/sep38/price?${query.toString()}`);
  return parseJsonOrThrow<IndicativePrice>(res);
}

export interface FirmQuote {
  id: string;
  expires_at: string;
  price: string;
  sell_asset: string;
  buy_asset: string;
  sell_amount: string;
  buy_amount: string;
}

export async function fetchFirmQuote(
  domain: string,
  token: string,
  params: { sell_asset: string; buy_asset: string; sell_amount: string; context: "sep6" | "sep31" | "sep24" }
): Promise<FirmQuote> {
  const res = await fetch("/api/sep38/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, token, ...params }),
  });
  return parseJsonOrThrow<FirmQuote>(res);
}
