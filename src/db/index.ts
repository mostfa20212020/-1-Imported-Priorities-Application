import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Function to create or retrieve the connection pool.
export const createPool = () => {
  if (!global._postgresPool) {
    const rawDbUrl = process.env.DATABASE_URL?.trim();
    const hasValidDatabaseUrl =
      Boolean(rawDbUrl) &&
      (rawDbUrl!.startsWith('postgres://') || rawDbUrl!.startsWith('postgresql://'));

    const poolConfig = hasValidDatabaseUrl
      ? {
          connectionString: rawDbUrl,
          max: 10,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 20000,
        }
      : {
          host: process.env.SQL_HOST || 'localhost',
          port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 10,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 20000, // Release idle connections after 20s to prevent stale server terminations
        };

    global._postgresPool = new Pool(poolConfig);

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err: any) => {
      // Normal PostgreSQL server-side idle client disconnects (Cloud SQL scale-down, maintenance, timeouts).
      // The pool automatically purges closed clients and reconnects on demand.
      const isKnownServerDisconnect =
        err?.code === '57P01' || // admin_shutdown
        err?.code === 'ECONNRESET' ||
        err?.code === 'EPIPE' ||
        err?.message?.includes('terminating connection due to administrator command') ||
        err?.message?.includes('Connection terminated') ||
        err?.message?.includes('connection closed');

      if (isKnownServerDisconnect) {
        // Handled gracefully by pool client lifecycle
        return;
      }
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

// Create or retrieve the pool instance.
export const pool = createPool();

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
