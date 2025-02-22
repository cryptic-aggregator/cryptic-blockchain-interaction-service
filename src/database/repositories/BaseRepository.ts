// src/repository/BaseRepository.ts
import { Pool } from 'pg';
import { DatabaseConnectionService } from '../DatabaseConnectionService';
import { IDatabaseTable } from '../../interfaces/database/DatabaseTable';

export abstract class BaseRepository<T extends IDatabaseTable> {
  protected pool: Pool;
  protected schema: string;
  protected tableName: string;
  protected columns: string[];

  constructor(
    protected connectionService: DatabaseConnectionService,
    schema: string,
    tableName: string,
    columns: string[]
  ) {
    this.pool = this.connectionService['pool'];
    this.schema = schema;
    this.tableName = tableName;
    this.columns = columns;
  }

  protected get fullTablePath(): string {
    return `"${this.schema}"."${this.tableName}"`;
  }

  abstract mapRowToEntity(row: any): T;

  async getByIdAsync(id: number | string): Promise<T | null> {
    const query = `SELECT ${this.columns.join(', ')} FROM ${this.fullTablePath} WHERE id = $1`;
    const values = [id];

    const result = await this.pool.query(query, values);
    if (result.rows.length > 0) {
      return this.mapRowToEntity(result.rows[0]);
    }
    return null;
  }

  async deleteAsync(id: number | string): Promise<void> {
    const query = `DELETE FROM ${this.fullTablePath} WHERE id = $1`;
    const values = [id];

    const result = await this.pool.query(query, values);
    if (result.rowCount === 0) {
      throw new Error("Couldn't delete any item");
    }
  }
}
