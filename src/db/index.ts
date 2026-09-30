import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _mysqlPool: mysql.Pool | undefined;
}

// Function to create or retrieve the MySQL connection pool.
export const createPool = () => {
  if (!global._mysqlPool) {
    const rawDbUrl = (process.env.MYSQL_URL || process.env.DATABASE_URL)?.trim();
    const hasValidDatabaseUrl =
      Boolean(rawDbUrl) &&
      (rawDbUrl!.startsWith('mysql://') || rawDbUrl!.startsWith('mysql2://'));

    const rawHost = process.env.MYSQL_HOST || process.env.SQL_HOST;
    const isUnixSocket = rawHost && rawHost.startsWith('/') && !rawHost.includes('PGSQL');

    const poolConfig: mysql.PoolOptions = hasValidDatabaseUrl
      ? {
          uri: rawDbUrl,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        }
      : isUnixSocket
      ? {
          socketPath: rawHost,
          user: process.env.MYSQL_USER || process.env.SQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || process.env.SQL_PASSWORD || '',
          database: process.env.MYSQL_DATABASE || process.env.SQL_DB_NAME || 'idaratalawliyat',
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        }
      : {
          host: rawHost && !rawHost.startsWith('/') ? rawHost : '127.0.0.1',
          port: process.env.MYSQL_PORT
            ? Number(process.env.MYSQL_PORT)
            : process.env.SQL_PORT && !isNaN(Number(process.env.SQL_PORT))
            ? Number(process.env.SQL_PORT)
            : 3306,
          user: process.env.MYSQL_USER || process.env.SQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || process.env.SQL_PASSWORD || '',
          database: process.env.MYSQL_DATABASE || process.env.SQL_DB_NAME || 'idaratalawliyat',
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        };

    global._mysqlPool = mysql.createPool(poolConfig);
  }
  return global._mysqlPool;
};

// Create or retrieve the pool instance.
export const pool = createPool();

// Initialize Drizzle with the MySQL pool and schema.
export const db = drizzle(pool, { schema, mode: 'default' });
