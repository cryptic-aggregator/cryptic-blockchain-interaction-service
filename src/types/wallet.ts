export interface GetWalletCoinsRequest {
  addresses: string[];
}

export interface Coin {
  symbol: string;
  balance: string;
}

export interface GetWalletCoinsResponse {
  coins: Coin[];
}