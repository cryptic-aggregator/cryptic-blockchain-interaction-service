import { createClient } from 'redis';

const redisClient = createClient({
    url: 'redis://20.215.241.137:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log('Redis connected');
})();

export async function cacheResponse(key: string, data: any): Promise<void> {
    await redisClient.set(key, JSON.stringify(data), { EX: 60 }); // TTL 60 секунд
}

export async function getCachedResponse(key: string): Promise<any> {
    const cachedData = await redisClient.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
}
