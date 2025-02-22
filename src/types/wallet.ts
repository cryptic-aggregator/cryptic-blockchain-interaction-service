export interface GetWalletCoinsRequest {
  address: string;
}

export interface Coin {
  symbol: string;
  balance: string;
}

export interface GetWalletCoinsResponse {
  coins: Coin[];
}