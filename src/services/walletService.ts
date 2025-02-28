import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import axios from 'axios';
import { GetWalletCoinsRequest, GetWalletCoinsResponse, Coin } from '../types/wallet';

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
    coins.push({ symbol: chain.toUpperCase(), balance: nativeBalance.toString() });
  } catch (error) {
    console.error(`Помилка отримання нативного балансу для ${chain} (${address}):`, error);
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
    console.error(`Помилка отримання токенів для ${chain} (${address}):`, error);
  }

  return coins;
}

export const walletService = {
  GetWalletCoins: async (
      call: ServerUnaryCall<GetWalletCoinsRequest, GetWalletCoinsResponse>,
      callback: sendUnaryData<GetWalletCoinsResponse>
  ): Promise<void> => {
    try {
      const addresses: string[] = call.request.addresses;
      console.log(`Отримано запит для адрес: ${addresses.join(', ')}`);

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
