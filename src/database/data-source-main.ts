import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

/**
 * Standalone TypeORM CLI DataSource for the MAIN connection (auth + audit + tenant + billing).
 *
 * Supports both SQLite (local/dev) and PostgreSQL (Railway/production).
 *
 * Railway setup:
 *   MAIN_DATABASE_TYPE=postgres
 *   MAIN_DATABASE_URL=postgresql://... (from Railway Postgres plugin)
 *
 * Usage:
 *   npm run migration:run:main       (dev — SQLite)
 *   npm run migration:run:main:prod  (prod — compiled JS, reads env)
 */

const mainDbType = (process.env.MAIN_DATABASE_TYPE ?? 'sqlite') as 'sqlite' | 'postgres';

const ENTITIES = [
  __dirname + '/../modules/auth/**/*.entity{.ts,.js}',
  __dirname + '/../modules/audit/**/*.entity{.ts,.js}',
  __dirname + '/../modules/tenant/**/*.entity{.ts,.js}',
  __dirname + '/../modules/billing/**/*.entity{.ts,.js}',
];

const MIGRATIONS = [__dirname + '/migrations-main/*{.ts,.js}'];

const mainDataSource =
  mainDbType === 'postgres'
    ? new DataSource({
        type: 'postgres',
        ...(process.env.MAIN_DATABASE_URL
          ? { url: process.env.MAIN_DATABASE_URL }
          : {
              host: process.env.MAIN_DATABASE_HOST || 'localhost',
              port: parseInt(process.env.MAIN_DATABASE_PORT || '5432', 10),
              username: process.env.MAIN_DATABASE_USERNAME,
              password: process.env.MAIN_DATABASE_PASSWORD,
              database: process.env.MAIN_DATABASE_NAME || 'zetu_main',
            }),
        ssl: process.env.MAIN_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        synchronize: false,
        logging: process.env.DATABASE_LOGGING === 'true',
      })
    : new DataSource({
        type: 'sqlite',
        database: process.env.MAIN_DATABASE_NAME || './data/main.sqlite',
        entities: ENTITIES,
        migrations: MIGRATIONS,
        synchronize: false,
        logging: process.env.DATABASE_LOGGING === 'true',
      });

export default mainDataSource;
