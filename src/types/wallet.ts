export interface GetWalletCoinsRequest {
  portfolioId: number;
  address: string[];
}

export interface Coin {
  symbol: string;
  balance: string;
  avgPurchasePrice?: string;
  currentMarketPrice?: string;
  currentValue?: string;
  priceChange1hPercent? : string,
  changeSinceAvgPurchase? : string,
  image?: string;
  name?: string;
}

export interface GetWalletCoinsResponse {
  coins: Coin[];
  totalPortfolioValueUSDT?: string;
}

export interface GetWalletTransactionsRequest {
  address: string;
  chain: string;
  sinceTs: number;
}

export interface GetWalletCoinsByAddressRequest {
  address: string;
  portfolioId: number;
}

export interface Transaction {
  transactionHash: string;
  tokenAddress: string;
  amount: string;
  ts: number;
  transactionType: number;
  fromAddress?: string;
  toAddress?: string;
  chain?: string;
  symbol?: string;
  logo?: string;
  token_name?: string;
  fee?: string;
  status?: boolean;
}

export interface GetWalletTransactionsResponse {
  transactions: Transaction[];
}
