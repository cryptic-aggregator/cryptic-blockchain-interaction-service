import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import axios from 'axios';
import { GetWalletCoinsRequest, GetWalletCoinsResponse, Coin } from '../types/wallet';
import {formatEther} from "ethers";

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjNmODFhZjY0LWNiZjAtNGRmOC1hNDNiLTJlNzliNzA3MDczNyIsIm9yZ0lkIjoiNDA3NTkwIiwidXNlcklkIjoiNDE4ODIwIiwidHlwZUlkIjoiZDY2MGU1MjYtM2VkZC00ZTUzLTg4NDYtZDVhOTBiYWY2ZWQxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjU3OTY2MTcsImV4cCI6NDg4MTU1NjYxN30.4tDcTjdtjoY7aEzzwJZIlD_mS6LtTCOY6Zxa5O8k694';

function detectChain(address: string): string {
  if (address.startsWith('0x') && address.length === 42) {
    return 'eth';
  }
  if (/^(1|3|bc1)/.test(address)) {
    return 'btc';
  }
  return 'sol';
}

async function getBalancesForAddress(address: string, chain: string): Promise<Coin[]> {
  const coins: Coin[] = [];

  try {
    const nativeRes = await axios.get(`https://deep-index.moralis.io/api/v2/${address}/balance`, {
      params: { chain },
      headers: { 'X-API-Key': MORALIS_API_KEY },
    });
    const nativeBalance = nativeRes.data.balance;
    if (chain === 'eth') {
      // Конвертуємо Wei в Ether
      const ethBalance = formatEther(nativeBalance);
      coins.push({ symbol: 'ETH', balance: ethBalance });
    } else if (chain === 'btc') {
      // Для BTC баланс повертається в сатоші (1 BTC = 1e8 сатоші)
      const btcBalance = parseFloat(nativeBalance) / 1e8;
      coins.push({ symbol: 'BTC', balance: btcBalance.toString() });
    } else if (chain === 'sol') {
      // Для Solana (1 SOL = 1e9 lamports)
      const solBalance = parseFloat(nativeBalance) / 1e9;
      coins.push({ symbol: 'SOL', balance: solBalance.toString() });
    } else {
      coins.push({ symbol: chain.toUpperCase(), balance: nativeBalance.toString() });
    }
  } catch (error) {
    console.error(`Error fetching native balance for ${chain} (${address}):`, error);
    coins.push({ symbol: chain.toUpperCase(), balance: 'error' });
  }

  try {
    const tokensRes = await axios.get(`https://deep-index.moralis.io/api/v2/${address}/erc20`, {
      params: { chain },
      headers: { 'X-API-Key': MORALIS_API_KEY },
    });
    const tokens = tokensRes.data;
    tokens.forEach((token: any) => {
      const decimals = Number(token.decimals) || 1;
      const balance = parseFloat(token.balance) / Math.pow(10, decimals);
      coins.push({ symbol: token.symbol, balance: balance.toString() });
    });
  } catch (error) {
    console.error(`Error fetching tokens for ${chain} (${address}):`, error);
  }

  return coins;
}

export const walletService = {
  GetWalletCoins: async (
      call: ServerUnaryCall<GetWalletCoinsRequest, GetWalletCoinsResponse>,
      callback: sendUnaryData<GetWalletCoinsResponse>
  ): Promise<void> => {
    try {
      const addresses = call.request.address;

      const results = await Promise.all(
          addresses.map(async (address) => {
            const chain = detectChain(address);
            const coins = await getBalancesForAddress(address, chain);
            return coins;
          })
      );

      const allCoins = results.flat();

      callback(null, { coins: allCoins });
    } catch (error) {
      console.error("Помилка у GetWalletCoins:", error);
      callback(error as Error, null);
    }
  },
};
