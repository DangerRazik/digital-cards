import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  // Эта роль имеет только SELECT на представление опубликованных снимков.
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'digital-cards-public-api',
  });

  constructor() {
    // Потеря соединения с простаивающей БД не должна завершать весь процесс.
    this.pool.on('error', () => {
      console.error('Соединение с базой прервано; следующий запрос попробует подключиться заново.');
    });
  }

  query<T extends QueryResultRow>(sql: string, values: unknown[]) {
    return this.pool.query<T>(sql, values);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
