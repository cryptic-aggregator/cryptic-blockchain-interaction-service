// helius.ts
import axios from 'axios';
import {Transaction} from '../types/wallet';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const HELIUS_BASE = process.env.HELIUS_BASE || 'https://api.helius.xyz/v0';
const SOL_DECIMALS = 9;

const MIN_THRESHOLD = 0.001;

const metadataCache: Record<string, {
    symbol: string;
    logoURI?: string;
    decimals: number;
    name?: string;
}> = {};

async function fetchOneTokenMetadata(mint: string) {
    if (metadataCache[mint]) return;

    try {
        const resp = await axios.post<Array<any>>(
            `${HELIUS_BASE}/token-metadata?api-key=${HELIUS_API_KEY}`,
            { mintAccounts: [mint] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const entry = resp.data[0];

        if (entry?.legacyMetadata) {
            const lm = entry.legacyMetadata;
            metadataCache[mint] = {
                symbol:   lm.symbol ?? '',
                logoURI:  lm.logoURI,
                decimals: lm.decimals ?? 0,
                name:     lm.name ?? ''
            };
            return;
        }

        let decimals = 0;
        let symbol   = '';
        let logoURI: string | undefined = undefined;
        let name     = '';

        try {
            const acctInfo   = entry.onChainAccountInfo?.accountInfo;
            const parsedInfo = acctInfo?.data?.parsed?.info;
            if (parsedInfo && typeof parsedInfo.decimals === 'number') {
                decimals = parsedInfo.decimals;
            }
        } catch {
            decimals = 0;
        }

        let uriFromMD: string | undefined;
        try {
            const md = entry.onChainMetadata?.metadata?.data;
            if (md) {
                name       = md.name ?? '';
                symbol     = md.symbol ?? '';
                uriFromMD  = md.uri ?? undefined;
            }
        } catch {
            uriFromMD = undefined;
        }

        if (uriFromMD) {
            try {
                const uriResp = await axios.get<{ name?: string; image?: string; symbol?: string }>(uriFromMD, {
                    headers: { 'Accept': 'application/json' }
                });

                const data = uriResp.data;
                if (data.name) {
                    name = data.name;
                }
                if (data.image) {
                    logoURI = data.image;
                }
                if (data.symbol) {
                    symbol = data.symbol;
                }
            } catch (err) {
                console.warn(`Failed to fetch metadata JSON for mint=${mint} from URI=${uriFromMD}:`, err);
            }
        }

        metadataCache[mint] = { symbol, logoURI, decimals, name };
    } catch (err) {
        console.error(`Error fetching metadata for ${mint}:`, err);
        metadataCache[mint] = { symbol: '', decimals: 0 };
    }
}


async function fetchSolanaHistory(address: string): Promise<any[]> {
    let before: string | undefined = undefined;
    const all: any[] = [];

    while (true) {
        const url = new URL(`${HELIUS_BASE}/addresses/${address}/transactions`);
        url.searchParams.set('api-key', HELIUS_API_KEY);
        url.searchParams.set('type', 'TRANSFER');
        if (before) url.searchParams.set('before', before);

        const resp = await axios.get<any[]>(url.toString());
        const batch = resp.data;
        if (!batch.length) break;

        all.push(...batch);
        before = batch[batch.length - 1].signature;
        await new Promise(r => setTimeout(r, 200));
    }

    return all;
}

export async function fetchSolanaTransactions(
    address: string
): Promise<Transaction[]> {
    const rawTxs = await fetchSolanaHistory(address);
    const results: Transaction[] = [];

    for (const tx of rawTxs) {
        const timestamp = tx.blockTime;

        for (const t of tx.tokenTransfers || []) {
            const mint = t.mint as string;

            if (!metadataCache[mint]) {
                await fetchOneTokenMetadata(mint);
            }
            const md = metadataCache[mint];

            const parsedRaw = parseFloat(t.tokenAmount);
            if (isNaN(parsedRaw)) continue;

            const amountHuman = t.tokenAmount

            if (parseFloat(amountHuman) <= MIN_THRESHOLD) {
                continue;
            }

            results.push({
                transactionHash: tx.signature,
                tokenAddress: mint,
                amount: amountHuman,
                ts: timestamp,
                transactionType: t.fromUserAccount.toLowerCase() === address.toLowerCase() ? 1 : 0,
                fromAddress: t.fromUserAccount,
                toAddress: t.toUserAccount,
                chain: 'sol',
                symbol: md.symbol,
                logo: md.logoURI,
                token_name: md.name,
            });
        }

        for (const n of tx.nativeTransfers || []) {
            const parsedRawSol = parseFloat(n.amount);
            if (isNaN(parsedRawSol)) continue;

            const amountHuman = (parsedRawSol / 10 ** SOL_DECIMALS).toString();
            if (parseFloat(amountHuman) <= MIN_THRESHOLD) continue;

            results.push({
                transactionHash: tx.signature,
                tokenAddress: 'SOL',
                amount: amountHuman,
                ts: timestamp,
                transactionType: n.fromUserAccount.toLowerCase() === address.toLowerCase() ? 1 : 0,
                fromAddress: n.fromUserAccount,
                toAddress: n.toUserAccount,
                chain: 'sol',
                symbol: 'SOL',
                logo: undefined
            });
        }
    }

    return results;
}