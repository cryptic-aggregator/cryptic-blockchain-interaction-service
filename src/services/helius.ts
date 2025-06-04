// helius.ts
import axios from 'axios';
import {Transaction} from '../types/wallet';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'ed346c68-14bf-46ad-a863-5cd646698342';
const HELIUS_BASE = process.env.HELIUS_BASE || 'https://api-mainnet.helius-rpc.com/v0';
const SOL_DECIMALS = 9;

const MIN_THRESHOLD = 0.001;


// Кеш метаданих: ключ = mint, значення = { symbol, logoURI, decimals, name }
const metadataCache: Record<string, {
    symbol: string;
    logoURI?: string;
    decimals: number;
    name?: string;
}> = {};

function delay(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
}


async function fetchMetadataBatch(mints: string[]): Promise<void> {
    if (!mints.length) return;

    try {
        // Виконуємо один POST‐запит з масивом mintAccounts
        const resp = await axios.post<any[]>(
            `${HELIUS_BASE}/token-metadata?api-key=${HELIUS_API_KEY}`,
            {mintAccounts: mints},
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'MyApp/1.0'
                },
                responseType: 'json'
            }
        );

        // resp.data — масив із метаданими для кожного mint
        for (const entry of resp.data) {
            const mintAddr = entry.mint || entry.address || '';
            if (!mintAddr) continue;

            // Якщо є legacyMetadata
            if (entry.legacyMetadata) {
                const lm = entry.legacyMetadata;
                metadataCache[mintAddr] = {
                    symbol: lm.symbol ?? '',
                    logoURI: lm.logoURI ?? undefined,
                    decimals: lm.decimals ?? 0,
                    name: lm.name ?? ''
                };
                continue;
            }

            // Інакше парсимо з onChainMetadata/onChainAccountInfo
            let decimals = 0;
            let symbol = '';
            let logoURI: string | undefined = undefined;
            let name = '';

            // onChainAccountInfo
            try {
                const acctInfo = entry.onChainAccountInfo?.accountInfo;
                const parsedInfo = acctInfo?.data?.parsed?.info;
                if (parsedInfo && typeof parsedInfo.decimals === 'number') {
                    decimals = parsedInfo.decimals;
                }
            } catch {
                decimals = 0;
            }

            // onChainMetadata
            let uriFromMD: string | undefined;
            try {
                const md = entry.onChainMetadata?.metadata?.data;
                if (md) {
                    name = md.name ?? '';
                    symbol = md.symbol ?? '';
                    uriFromMD = md.uri ?? undefined;
                }
            } catch {
                uriFromMD = undefined;
            }

            // Додаткове завантаження JSON‐файлу з `uriFromMD`, якщо він присутній
            if (uriFromMD) {
                try {
                    const uriResp = await axios.get<{ name?: string; image?: string; symbol?: string }>(
                        uriFromMD,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'MyApp/1.0'
                            },
                            responseType: 'json'
                        }
                    );

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
                    console.warn(`Failed to fetch metadata JSON for mint=${mintAddr} from URI=${uriFromMD}:`, err);
                }
            }

            metadataCache[mintAddr] = {symbol, logoURI, decimals, name};
        }
    } catch (err) {
        console.error('Error in fetchMetadataBatch:', err);
        // Якщо помилка, заповнюємо кеш «порожніми» даними, щоб не блокувати весь процес
        for (const mintAddr of mints) {
            if (!metadataCache[mintAddr]) {
                metadataCache[mintAddr] = {symbol: '', decimals: 0};
            }
        }
    }
}

/**
 * Дістає всю історію транзакцій (batch) через Helius
 * – збирає масив усіх транзакцій за вказаною адресою.
 */
async function fetchSolanaHistory(address: string): Promise<any[]> {
    let before: string | undefined = undefined;
    const all: any[] = [];

    while (true) {
        const url = new URL(`${HELIUS_BASE}/addresses/${address}/transactions`);
        url.searchParams.set('api-key', HELIUS_API_KEY);
        url.searchParams.set('type', 'TRANSFER');
        if (before) url.searchParams.set('before', before);

        const resp = await axios.get<any[]>(url.toString(), {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MyApp/1.0'
            },
            responseType: 'json'
        });

        // Якщо Helius повернув HTML (Cloudflare block), припиняємо
        if (!Array.isArray(resp.data)) {
            console.error('Helius returned non-JSON:', resp.data);
            throw new Error('Blocked by Helius or invalid response');
        }

        const batch = resp.data;
        if (!batch.length) break;

        all.push(...batch);
        before = batch[batch.length - 1].signature;

        // Коротка пауза, щоб не перегріти API (можна збільшити, якщо rate-limit все ще спрацьовує)
        await delay(500);
    }

    return all;
}

export async function fetchSolanaTransactions(address: string): Promise<Transaction[]> {
    // 1) Дістаємо всю історію транзакцій (raw)
    const rawTxs = await fetchSolanaHistory(address);

    // 2) Обходимо rawTxs і збираємо множину (Set) унікальних mint
    const uniqueMints = new Set<string>();
    for (const tx of rawTxs) {
        if (Array.isArray(tx.tokenTransfers)) {
            for (const t of tx.tokenTransfers) {
                if (typeof t.mint === 'string') {
                    uniqueMints.add(t.mint);
                }
            }
        }
        // Ми не беремо в Set `'SOL'` для nativeTransfers, оскільки для SOL зазвичай не треба метаданих
    }

    // 3) Вилучимо зі списку ті mints, які вже є в кеші
    const toFetch: string[] = [];
    for (const mint of uniqueMints) {
        if (!metadataCache[mint]) {
            toFetch.push(mint);
        }
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        await fetchMetadataBatch(batch);
        await delay(500);
    }

    const results: Transaction[] = [];

    for (const tx of rawTxs) {
        const timestamp = tx.blockTime;

        // 5.1) Обробка SPL‐токенів
        for (const t of tx.tokenTransfers || []) {
            const mint = t.mint as string;
            const md = metadataCache[mint] || {symbol: '', logoURI: undefined, decimals: 0, name: ''};

            const parsedRaw = parseFloat(t.tokenAmount);
            if (isNaN(parsedRaw)) continue;

            const amountHuman = t.tokenAmount;
            if (parseFloat(amountHuman) <= MIN_THRESHOLD) continue;

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
                token_name: md.name
            });
        }

        // 5.2) Обробка nativeTransfers (SOL)
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