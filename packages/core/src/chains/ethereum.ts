import type { FetchLike } from "../prices/binance";
import { sleep, withRetry } from "../http";
import { ASSETS, type AddressHistory, type Flow } from "../crypto/types";

export const BLOCKSCOUT_HOST = "https://eth.blockscout.com";
const MAX_PAGES = 200;

interface BalanceItem {
  block_timestamp: string;
  delta: string;
  transaction_hash: string | null;
  block_number: number;
  value: string;
}

interface BalancePage {
  items: BalanceItem[];
  next_page_params: Record<string, string | number> | null;
}

/**
 * Native ETH-saldogeschiedenis via Blockscout (coin-balance-history).
 * Bevat alle saldowijzigingen, inclusief interne transacties en gas fees.
 * ERC-20-tokens worden (nog) niet meegenomen.
 */
export async function fetchEthereumHistory(address: string, rawFetch: FetchLike = fetch): Promise<AddressHistory> {
  const fetchFn = withRetry(rawFetch);
  const flows: Flow[] = [];
  let currentBalance: bigint | null = null;
  let query = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(300); // vriendelijk tempo voor gratis publieke API
    const res = await fetchFn(`${BLOCKSCOUT_HOST}/api/v2/addresses/${address}/coin-balance-history${query}`);
    if (res.status === 404) return { address, asset: ASSETS.ethereum, flows: [], currentBalance: 0n };
    if (res.status === 429) throw new Error("Blockscout is tijdelijk overbelast (te veel verzoeken). Probeer het over een paar minuten opnieuw.");
    if (!res.ok) throw new Error(`Ethereum-historie ophalen mislukt (${res.status}).`);
    const data = (await res.json()) as BalancePage;
    for (const item of data.items) {
      if (currentBalance === null) currentBalance = BigInt(item.value);
      const delta = BigInt(item.delta);
      if (delta === 0n) continue;
      flows.push({
        id: item.transaction_hash ?? `block-${item.block_number}`,
        address,
        timestamp: Date.parse(item.block_timestamp),
        delta,
      });
    }
    if (!data.next_page_params) {
      flows.sort((a, b) => a.timestamp - b.timestamp);
      return { address, asset: ASSETS.ethereum, flows, currentBalance: currentBalance ?? 0n };
    }
    query = "?" + new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  throw new Error("Dit adres heeft te veel saldowijzigingen. Dat wordt nog niet ondersteund.");
}
