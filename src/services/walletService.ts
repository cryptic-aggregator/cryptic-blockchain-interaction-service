import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import axios from 'axios';
import { GetWalletCoinsRequest, GetWalletCoinsResponse, Coin } from '../types/wallet';
import {formatEther} from "ethers";

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjNmODFhZjY0LWNiZjAtNGRmOC1hNDNiLTJlNzliNzA3MDczNyIsIm9yZ0lkIjoiNDA3NTkwIiwidXNlcklkIjoiNDE4ODIwIiwidHlwZUlkIjoiZDY2MGU1MjYtM2VkZC00ZTUzLTg4NDYtZDVhOTBiYWY2ZWQxIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjU3OTY2MTcsImV4cCI6NDg4MTU1NjYxN30.4tDcTjdtjoY7aEzzwJZIlD_mS6LtTCOY6Zxa5O8k694';
const CRYPTOCOMPARE_API_KEY = '2eafccccdf1cc8ebd3a533d8d61736f358d4db2d2f66eab4a732f30b714f5813';

// Мапування символів токенів для CryptoCompare
const cryptoCompareMapping: { [symbol: string]: string } = {
  'WETH': 'ETH',
  'ETH': 'ETH',
  'USDT': 'USDT',
  // додайте інші відповідності за потребою
};

/**
 * Функція отримання поточної ринкової ціни токена з CryptoCompare API.
 */
async function getCurrentPriceCryptoCompare(tokenSymbol: string): Promise<number> {
  const mappedSymbol = cryptoCompareMapping[tokenSymbol];
  if (!mappedSymbol) {
    console.error(`No CryptoCompare mapping for token symbol ${tokenSymbol}`);
    return 0;
  }
  try {
    const response = await axios.get('https://min-api.cryptocompare.com/data/price', {
      params: {
        fsym: mappedSymbol,
        tsyms: 'USD'
      },
      headers: {
        'authorization': `Apikey ${CRYPTOCOMPARE_API_KEY}`
      }
    });
    if (response.data && response.data.USD) {
      return Number(response.data.USD);
    }
    return 0;
  } catch (error) {
    console.error(`Error fetching current price from CryptoCompare for ${tokenSymbol}:`, error);
    return 0;
  }
}

/**
 * Функція отримання історичної ціни токена з CryptoCompare API за добовим інтервалом.
 * Використовує endpoint /data/v2/histoday, повертає значення "close".
 */
async function getHistoricalPriceCryptoCompare(tokenSymbol: string, timestamp: number): Promise<number> {
  const mappedSymbol = cryptoCompareMapping[tokenSymbol];
  if (!mappedSymbol) {
    console.error(`No CryptoCompare mapping for token symbol ${tokenSymbol}`);
    return 0;
  }
  try {
    const response = await axios.get('https://min-api.cryptocompare.com/data/v2/histoday', {
      params: {
        fsym: mappedSymbol,
        tsym: 'USD',
        limit: 1,
        toTs: timestamp, // дані за добу, що закінчується у цей момент
      },
      headers: {
        'authorization': `Apikey ${CRYPTOCOMPARE_API_KEY}`
      }
    });
    if (response.data && response.data.Data && response.data.Data.Data && response.data.Data.Data.length > 0) {
      const dataPoint = response.data.Data.Data[0];
      return Number(dataPoint.close);
    }
    return 0;
  } catch (error) {
    console.error(`Error fetching historical price from CryptoCompare for ${tokenSymbol} at timestamp ${timestamp}:`, error);
    return 0;
  }
}

/**
 * Функція розрахунку середньої ціни покупки токена за історією транзакцій.
 */
async function getAveragePurchasePrice(address: string, tokenAddress: string, chain: string, tokenSymbol: string): Promise<string> {
  try {
    const transfersRes = await axios.get(`https://deep-index.moralis.io/api/v2/${address}/erc20/transfers`, {
      params: { chain, token_address: tokenAddress },
      headers: { 'X-API-Key': MORALIS_API_KEY },
    });
    const transfers = transfersRes.data.result;
    let totalAmount = 0;
    let totalCost = 0;
    for (const tx of transfers) {
      if (tx.to_address.toLowerCase() === address.toLowerCase()) {
        const decimals = Number(tx.decimals) || 1;
        const amount = parseFloat(tx.value) / Math.pow(10, decimals);
        const txTimestamp = Math.floor(new Date(tx.block_timestamp).getTime() / 1000);
        const price = await getHistoricalPriceCryptoCompare(tokenSymbol, txTimestamp);
        totalAmount += amount;
        totalCost += price * amount;
      }
    }
    if (totalAmount > 0) {
      return (totalCost / totalAmount).toString();
    }
  } catch (error) {
    console.error(`Error fetching transfers for token ${tokenAddress} on ${chain} (${address}):`, error);
  }
  return "0";
}

function detectChain(address: string): string {
  if (address.startsWith('0x') && address.length === 42) {
    return 'eth';
  }
  if (/^(1|3|bc1)/.test(address)) {
    return 'btc';
  }
  return 'sol';
}

/**
 * Функція отримання балансів (нативний актив та токени) для заданої адреси.
 * Окрім цього, для кожного активу отримується поточна ціна та обчислюються:
 *  - currentValue: поточна вартість (balance * currentMarketPrice)
 *  - priceChange1hPercent: зміна ціни за останню годину (у відсотках)
 *  - changeSinceAvgPurchase: зміна поточної ціни відносно середньої ціни покупки (у відсотках)
 */
async function getBalancesForAddress(address: string, chain: string): Promise<Coin[]> {
  const coins: Coin[] = [];
  const currentTimestamp = Math.floor(Date.now() / 1000);
  // Для нативного активу
  try {
    const nativeRes = await axios.get(`https://deep-index.moralis.io/api/v2/${address}/balance`, {
      params: { chain },
      headers: { 'X-API-Key': MORALIS_API_KEY },
    });
    const nativeBalance = nativeRes.data.balance;
    if (chain === 'eth') {
      const ethBalance = formatEther(nativeBalance);
      const numericBalance = parseFloat(ethBalance);
      const currentPrice = await getCurrentPriceCryptoCompare('ETH');
      const currentValue = numericBalance * currentPrice;
      // Отримуємо ціну 1 годину тому
      const price1hAgo = await getHistoricalPriceCryptoCompare('ETH', currentTimestamp - 3600);
      const priceChange1hPercent = price1hAgo > 0 ? (((currentPrice - price1hAgo) / price1hAgo) * 100).toString() : "0";
      // Для нативного активу середня ціна покупки може бути відсутня, встановлюємо 0
      const changeSinceAvgPurchase = "0";
      coins.push({
        symbol: 'ETH',
        balance: ethBalance,
        currentMarketPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        avgPurchasePrice: "0",
        priceChange1hPercent,
        changeSinceAvgPurchase
      });
    } else if (chain === 'btc') {
      const btcBalance = parseFloat(nativeBalance) / 1e8;
      const currentPrice = await getCurrentPriceCryptoCompare('BTC');
      const currentValue = btcBalance * currentPrice;
      const price1hAgo = await getHistoricalPriceCryptoCompare('BTC', currentTimestamp - 3600);
      const priceChange1hPercent = price1hAgo > 0 ? (((currentPrice - price1hAgo) / price1hAgo) * 100).toString() : "0";
      const changeSinceAvgPurchase = "0";
      coins.push({
        symbol: 'BTC',
        balance: btcBalance.toString(),
        currentMarketPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        avgPurchasePrice: "0",
        priceChange1hPercent,
        changeSinceAvgPurchase
      });
    } else if (chain === 'sol') {
      const solBalance = parseFloat(nativeBalance) / 1e9;
      const currentPrice = await getCurrentPriceCryptoCompare('SOL');
      const currentValue = solBalance * currentPrice;
      const price1hAgo = await getHistoricalPriceCryptoCompare('SOL', currentTimestamp - 3600);
      const priceChange1hPercent = price1hAgo > 0 ? (((currentPrice - price1hAgo) / price1hAgo) * 100).toString() : "0";
      const changeSinceAvgPurchase = "0";
      coins.push({
        symbol: 'SOL',
        balance: solBalance.toString(),
        currentMarketPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        avgPurchasePrice: "0",
        priceChange1hPercent,
        changeSinceAvgPurchase
      });
    } else {
      coins.push({ symbol: chain.toUpperCase(), balance: nativeBalance.toString() });
    }
  } catch (error) {
    console.error(`Error fetching native balance for ${chain} (${address}):`, error);
    coins.push({ symbol: chain.toUpperCase(), balance: 'error' });
  }

  // Для токенів
  try {
    const tokensRes = await axios.get(`https://deep-index.moralis.io/api/v2/${address}/erc20`, {
      params: { chain },
      headers: { 'X-API-Key': MORALIS_API_KEY },
    });
    const tokens = tokensRes.data;
    const tokenPromises = tokens.map(async (token: any) => {
      const decimals = Number(token.decimals) || 1;
      const balance = parseFloat(token.balance) / Math.pow(10, decimals);
      const avgPrice = await getAveragePurchasePrice(address, token.token_address, chain, token.symbol);
      const currentPrice = await getCurrentPriceCryptoCompare(token.symbol);
      const currentValue = balance * currentPrice;
      const price1hAgo = await getHistoricalPriceCryptoCompare(token.symbol, currentTimestamp - 3600);
      const priceChange1hPercent = price1hAgo > 0 ? (((currentPrice - price1hAgo) / price1hAgo) * 100).toString() : "0";
      const changeSinceAvgPurchase = parseFloat(avgPrice) > 0 ? (((currentPrice - parseFloat(avgPrice)) / parseFloat(avgPrice)) * 100).toString() : "0";
      return {
        symbol: token.symbol,
        balance: balance.toString(),
        avgPurchasePrice: avgPrice,
        currentMarketPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        priceChange1hPercent,
        changeSinceAvgPurchase
      };
    });
    const tokenCoins: Coin[] = await Promise.all(tokenPromises);
    coins.push(...tokenCoins);
  } catch (error) {
    console.error(`Error fetching tokens for ${chain} (${address}):`, error);
  }

  return coins;
}

export const walletService = {
  GetWalletCoins: async (
      call: import('@grpc/grpc-js').ServerUnaryCall<GetWalletCoinsRequest, GetWalletCoinsResponse>,
      callback: import('@grpc/grpc-js').sendUnaryData<GetWalletCoinsResponse>
  ): Promise<void> => {
    try {
      const addresses: string[] = call.request.address;
      const results = await Promise.all(
          addresses.map(async (address) => {
            const chain = detectChain(address);
            const coins = await getBalancesForAddress(address, chain);
            return coins;
          })
      );
      const allCoins = results.flat();

      // Обчислюємо сумарну вартість портфеля (USDT)
      const totalValue = allCoins.reduce((acc, coin) => {
        const val = parseFloat(coin.currentValue || "0");
        return acc + (isNaN(val) ? 0 : val);
      }, 0);

      callback(null, { coins: allCoins, totalPortfolioValueUSDT: totalValue.toString() });
    } catch (error) {
      console.error("Error in GetWalletCoins:", error);
      callback(error as Error, null);
    }
  },
};;