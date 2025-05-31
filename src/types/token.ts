export interface GetCurrentPriceRequest {
    symbol: string;  // наприклад "ETH", "USDT", "SOL" тощо
}

/**
 * Відповідь з поточною ціною.
 */
export interface GetCurrentPriceResponse {
    price: string;  // ціна як рядок (щоб не втрачати точність)
    ts: number;     // Unix‐timestamp у секундах
}


/**
 * Запит для отримання історії цін.
 * Вказуємо лише символ, from_ts і to_ts.
 */
export interface GetPriceHistoryRequest {
    symbol: string;   // наприклад "ETH", "USDT", "SOL"
    from_ts: number;  // Unix‐timestamp початку діапазону (0 = “за замовчуванням, рік тому”)
    to_ts: number;    // Unix‐timestamp кінця (0 = “за замовчуванням, зараз”)
}

/**
 * Окрема точка (timestamp + ціна) у відповіді історії.
 */
export interface PricePoint {
    ts: number;      // Unix‐timestamp
    price: string;   // ціна як рядок
}

/**
 * Відповідь із масивом історичних точок цін.
 */
export interface GetPriceHistoryResponse {
    prices: PricePoint[];
}