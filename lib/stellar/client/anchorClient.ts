import { parseJsonOrThrow } from "./http";

/** Browser-side call into Ferry's `/api/anchor/currencies` route — see that route for why this exists. */

export interface AnchorCurrency {
  code?: string;
  issuer?: string;
}

export async function fetchAnchorCurrencies(domain: string): Promise<AnchorCurrency[]> {
  const query = new URLSearchParams({ domain });
  const res = await fetch(`/api/anchor/currencies?${query.toString()}`);
  const { currencies } = await parseJsonOrThrow<{ currencies: AnchorCurrency[] }>(res);
  return currencies;
}

/** `stellar:<code>:<issuer>` for the first currency the anchor publishes under `code`, or `null` if it doesn't list one. */
export function findCurrencyAsset(currencies: AnchorCurrency[], code: string): string | null {
  const match = currencies.find((c) => c.code === code && c.issuer);
  return match ? `stellar:${code}:${match.issuer}` : null;
}
