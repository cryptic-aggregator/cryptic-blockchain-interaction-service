import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export class DatabaseConnectionService {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
        });

        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }

    async getClient() {
        return this.pool.connect();
    }

    async closePool() {
        await this.pool.end();
    }
}
