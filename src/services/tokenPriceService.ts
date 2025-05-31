import { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import axios from 'axios';
import {
    GetCurrentPriceRequest,
    GetCurrentPriceResponse,
    GetPriceHistoryRequest,
    GetPriceHistoryResponse,
    PricePoint,
} from '../types/token';

const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY || '';

const CRYPTOCOMPARE_BASE = process.env.CRYPTOCOMPARE_BASE || 'https://min-api.cryptocompare.com/data';

const DELAY_BETWEEN_CALLS_MS = 500;

/** Утиліта для затримки між запитами */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCurrentPrice(symbol: string): Promise<number> {
    try {
        const res = await axios.get(`${CRYPTOCOMPARE_BASE}/price`, {
            params: { fsym: symbol, tsyms: 'USD' },
            headers: { authorization: `Apikey ${CRYPTOCOMPARE_API_KEY}` },
        });
        if (res.data && typeof res.data.USD === 'number') {
            return res.data.USD;
        }
        return 0;
    } catch (err) {
        console.error(`Error fetching current price for ${symbol}:`, (err as any).toString());
        return 0;
    }
}

async function fetchHistoricalHourlyPrices(
    symbol: string,
    fromTs: number,
    toTs: number
): Promise<Array<{ time: number; close: number }>> {
    const nowTs = Math.floor(Date.now() / 1000);

    if (!toTs || toTs <= 0) {
        toTs = nowTs;
    }

    if (!fromTs || fromTs <= 0) {
        fromTs = toTs - 365 * 24 * 3600;
    }

    const allPoints: Array<{ time: number; close: number }> = [];

    const MAX_LIMIT = 2000;

    let currentEnd = toTs;

    while (currentEnd > fromTs) {
        // Підраховуємо скільки годин у цьому шматку
        const earliestPossible = currentEnd - MAX_LIMIT * 3600;
        // Якщо earliestPossible менший за fromTs, то беремо саме fromTs
        const chunkStart = earliestPossible > fromTs ? earliestPossible : fromTs;
        // Кількість годин = floor((currentEnd - chunkStart)/3600)
        const hoursDiff = Math.floor((currentEnd - chunkStart) / 3600);

        // limit = кількість годин, але CryptoCompare повертає (limit + 1) точок:
        //   наприклад, якщо hoursDiff=10, limit=10, то ми отримаємо 11 точок (точка в currentEnd і 10 годин «до»).
        const limit = hoursDiff < 0 ? 0 : hoursDiff;

        try {
            const res = await axios.get(`${CRYPTOCOMPARE_BASE}/v2/histohour`, {
                params: {
                    fsym: symbol,
                    tsym: 'USD',
                    limit: limit,
                    toTs: currentEnd,
                },
                headers: { authorization: `Apikey ${CRYPTOCOMPARE_API_KEY}` },
            });

            if (res.data && res.data.Data && Array.isArray(res.data.Data.Data)) {
                // Монтуємо масив точок. Це вже відсортовано від найстарішої до наймолодшої у відповіді.
                const chunkPoints = (res.data.Data.Data as any[]).map(pt => ({
                    time: pt.time as number,
                    close: pt.close as number,
                }));

                // Якщо це не перший «чанк» (allPoints не порожній), то обов’язково потрібно
                // видалити останній елемент із chunkPoints, бо він дублює перехід зі старшого чанку.
                if (allPoints.length > 0 && chunkPoints.length > 0) {
                    // Наприклад, якщо у попередньому чанку була точка з time = X,
                    // то центральний елемент цього chunkPoints теж матиме time = X — його треба зрізати.
                    chunkPoints.pop();
                }

                // Додаємо весь масив chunkPoints до allPoints
                allPoints.push(...chunkPoints);
            }
        } catch (err) {
            console.error(`Error fetching historical hourly prices for ${symbol}:`, (err as any).toString());
            // Якщо помилка — краще вийти, а не безкінечно крутити цикл
            break;
        }

        // Переходимо «минуло» одного шматка: робимо nextEnd = chunkStart - 1 секунди
        currentEnd = chunkStart - 1;

        // Невеличка пауза, щоб не перевантажувати CryptoCompare
        await delay(DELAY_BETWEEN_CALLS_MS);
    }

    return allPoints;
}


export const tokenPriceService = {
    GetCurrentPrice: async (
        call: ServerUnaryCall<GetCurrentPriceRequest, GetCurrentPriceResponse>,
        callback: sendUnaryData<GetCurrentPriceResponse>
    ) => {
        const { symbol } = call.request;

        try {
            await delay(DELAY_BETWEEN_CALLS_MS);

            const priceNumber = await fetchCurrentPrice(symbol.toUpperCase());
            const nowUnix = Math.floor(Date.now() / 1000);

            const response: GetCurrentPriceResponse = {
                price: priceNumber.toString(),
                ts: nowUnix,
            };
            callback(null, response);
        } catch (err) {
            console.error('GetCurrentPrice error:', (err as any).toString());
            callback(err as Error, null);
        }
    },

    GetPriceHistory: async (
        call: ServerUnaryCall<GetPriceHistoryRequest, GetPriceHistoryResponse>,
        callback: sendUnaryData<GetPriceHistoryResponse>
    ) => {
        const { symbol, from_ts, to_ts } = call.request;

        try {
            await delay(DELAY_BETWEEN_CALLS_MS);

            const rawData = await fetchHistoricalHourlyPrices(
                symbol.toUpperCase(),
                from_ts,
                to_ts
            );

            const pricePoints: PricePoint[] = rawData.map(pt => ({
                ts: pt.time,
                price: pt.close.toString(),
            }));

            const response: GetPriceHistoryResponse = {
                prices: pricePoints,
            };
            callback(null, response);
        } catch (err) {
            console.error('GetPriceHistory error:', (err as any).toString());
            callback(err as Error, null);
        }
    },
};