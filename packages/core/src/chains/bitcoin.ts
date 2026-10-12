import type { FetchLike } from "../prices/binance";
import { sleep, withRetry } from "../http";
import { ASSETS, type AddressHistory, type Flow } from "../crypto/types";

export const MEMPOOL_HOST = "https://mempool.space";
const PAGE_SIZE = 25;
const MAX_PAGES = 200;

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout: { scriptpubkey_address?: string; value: number } | null }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

interface MempoolAddress {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

export function txDelta(tx: MempoolTx, address: string): bigint {
  let delta = 0n;
  for (const o of tx.vout) if (o.scriptpubkey_address === address) delta += BigInt(o.value);
  for (const i of tx.vin) if (i.prevout?.scriptpubkey_address === address) delta -= BigInt(i.prevout.value);
  return delta;
}

/** Haalt alle bevestigde transacties van één Bitcoin-adres op (alleen publieke data). */
export async function fetchBitcoinHistory(address: string, rawFetch: FetchLike = fetch): Promise<AddressHistory> {
  const fetchFn = withRetry(rawFetch);
  const infoRes = await fetchFn(`${MEMPOOL_HOST}/api/address/${address}`);
  if (!infoRes.ok) throw new Error(`Bitcoin-adres ophalen mislukt (${infoRes.status}).`);
  const info = (await infoRes.json()) as MempoolAddress;
  const currentBalance = BigInt(info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum);

  const flows: Flow[] = [];
  let lastSeen: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(150); // vriendelijk tempo voor gratis publieke API
    const url = `${MEMPOOL_HOST}/api/address/${address}/txs/chain${lastSeen ? `/${lastSeen}` : ""}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Bitcoin-transacties ophalen mislukt (${res.status}).`);
    const txs = (await res.json()) as MempoolTx[];
    for (const tx of txs) {
      if (!tx.status.confirmed || !tx.status.block_time) continue;
      const delta = txDelta(tx, address);
      if (delta !== 0n) flows.push({ id: tx.txid, address, timestamp: tx.status.block_time * 1000, delta });
    }
    if (txs.length < PAGE_SIZE) {
      flows.sort((a, b) => a.timestamp - b.timestamp);
      return { address, asset: ASSETS.bitcoin, flows, currentBalance };
    }
    lastSeen = txs[txs.length - 1]?.txid ?? null;
  }
  throw new Error(`Dit adres heeft meer dan ${PAGE_SIZE * MAX_PAGES} transacties. Dat wordt nog niet ondersteund.`);
}
