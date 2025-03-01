export interface GetWalletCoinsRequest {
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
}

export interface GetWalletCoinsResponse {
  coins: Coin[];
  totalPortfolioValueUSDT?: string;
}