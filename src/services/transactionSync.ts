import axios from 'axios';
import {
    ServerUnaryCall,
    sendUnaryData,
} from '@grpc/grpc-js';
import {
    GetWalletTransactionsRequest,
    GetWalletTransactionsResponse,
    Transaction,
} from '../types/wallet';

import {
    Connection,
    PublicKey,
    ConfirmedSignatureInfo,
    ParsedInstruction,
    ParsedTransactionWithMeta
} from '@solana/web3.js';

import {fetchSolanaTransactions,
} from './helius';


const MORALIS_BASE = process.env.MORALIS_BASE || 'https://api.moralis.io/api/v2';
const PAGE_LIMIT = 100;
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';

async function fetchEvmTransactions(
    address: string,
    chain: string,
    sinceTs: number
): Promise<Transaction[]> {
    const all: Transaction[] = [];
    let cursor: string | null = null;

    // обираємо endpoint залежно від мережі
    const getEndpoint = () => {
        switch (chain) {
            case 'sol':
            case 'solana':
                // SPL-токени на Solana
                return `https://solana-gateway.moralis.io/account/mainnet/${address}/swaps`;
            default:
                // ERC-20 та інші EVM-сумісні
                return `${MORALIS_BASE}/${address}/erc20/transfers`;
        }
    };

    const endpoint = getEndpoint();

    do {
        const params: Record<string, any> = {
            chain,
            limit: PAGE_LIMIT,
            ...(cursor ? {cursor} : {}),
            ...(sinceTs ? {from_date: new Date(sinceTs * 1000).toISOString()} : {}),
        };

        const res = await axios.get(endpoint, {
            params,
            headers: {'X-API-Key': MORALIS_API_KEY},
        });

        // у відповіді в обох випадках поле result
        const result: any[] = res.data.result;
        cursor = res.data.cursor || null;

        for (const tx of result) {
            const txTs = Math.floor(new Date(tx.block_timestamp).getTime() / 1000);
            if (!sinceTs || txTs > sinceTs) {
                all.push({
                    transactionHash: tx.transaction_hash,
                    tokenAddress:     // у Solana буде mintAddress
                        chain.startsWith('sol')
                            ? tx.mintAddress
                            : tx.token_address,
                    amount: tx.value,          // у solana.value = amount в lamports
                    ts: txTs,
                    transactionType: tx.from_address?.toLowerCase() === address.toLowerCase() ? 1 : 0,
                });
            }
        }
    } while (cursor);

    return all;
}


export const transactionService = {
    GetWalletTransactions: async (
        call: ServerUnaryCall<GetWalletTransactionsRequest, GetWalletTransactionsResponse>,
        callback: sendUnaryData<GetWalletTransactionsResponse>
    ) => {
        const {address, chain, sinceTs} = call.request;
        try {
            let txs: Transaction[];
            if (chain === 'sol' || chain === 'solana') {
                txs = await fetchSolanaTransactions(address)
            } else {
                txs = await fetchEvmTransactions(address, chain, sinceTs);
            }
            callback(null, { transactions: txs });
        } catch (err) {
            console.error('GetWalletTransactions error:', err);
            callback(err as Error, null);
        }
    }
};