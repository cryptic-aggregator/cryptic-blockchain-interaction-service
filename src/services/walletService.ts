import { ethers } from 'ethers';
import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { GetWalletCoinsRequest, GetWalletCoinsResponse, Coin } from '../types/wallet';
import { Connection, clusterApiUrl, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';


const solanaConnection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

async function getCoinBalances(address: string): Promise<Coin[]> {
  const coins: Coin[] = [];

  try {
    const publicKey = new PublicKey(address);
    const solBalanceLamports = await solanaConnection.getBalance(publicKey);
    const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
    coins.push({ symbol: 'SOL', balance: solBalance.toString() });
  } catch (err) {
    console.error("Помилка отримання SOL балансу:", err);
    coins.push({ symbol: 'SOL', balance: 'error' });
  }


  try {
    const btcResponse = await fetch(`https://blockstream.info/api/address/${address}`);
    if (!btcResponse.ok) {
      throw new Error(`BTC API відповідає з помилкою: ${btcResponse.statusText}`);
    }
    const btcData = await btcResponse.json();
    const funded = btcData.chain_stats.funded_txo_sum;
    const spent = btcData.chain_stats.spent_txo_sum;
    const btcBalanceSatoshis = funded - spent;
    const btcBalance = btcBalanceSatoshis / 1e8;
    coins.push({ symbol: 'BTC', balance: btcBalance.toString() });
  } catch (err) {
    console.error("Помилка отримання BTC балансу:", err);
    coins.push({ symbol: 'BTC', balance: 'error' });
  }

  return coins;
}

export const walletService = {
  GetWalletCoins: async (
    call: ServerUnaryCall<GetWalletCoinsRequest, GetWalletCoinsResponse>,
    callback: sendUnaryData<GetWalletCoinsResponse>
  ): Promise<void> => {
    try {
      const address = call.request.address;
      console.log(`Отримано запит для адреси: ${address}`);

      // Отримуємо баланси для ETH, SOL та BTC
      const coins = await getCoinBalances(address);
      callback(null, { coins });
    } catch (error) {
      console.error("Помилка у GetWalletCoins:", error);
      callback(error as Error, null);
    }
  },
};
