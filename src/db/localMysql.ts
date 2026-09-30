import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.ts";
import { ENV } from "../../server/_core/env.ts";

let localPool: mysql.Pool | null = null;
let localDrizzleDb: MySql2Database<typeof schema> | null = null;
let mockLocalDbInstance: any = null;

/**
 * فحص ما إذا كانت متغيرات بيئة الاتصال بقاعدة MySQL المحلية متوفرة ومكتملة
 */
export function isLocalMysqlConfigured(): boolean {
  if (mockLocalDbInstance) return true;

  // إذا تم توفير رابط مباشر للـ Local MySQL
  if (ENV.localMysqlUrl && (ENV.localMysqlUrl.startsWith("mysql://") || ENV.localMysqlUrl.startsWith("mysql2://"))) {
    return true;
  }

  // أو توفير المتغيرات التفصيلية: Host + Database + User
  return Boolean(ENV.localMysqlHost && ENV.localMysqlDatabase && ENV.localMysqlUser);
}

/**
 * إنشاء أو استرجاع الـ Connection Pool المستقل الخاص بقاعدة MySQL المحلية لجهاز الأرشيف
 * منفصل تماماً عن اتصال Cloud SQL
 */
export function getLocalMysqlPool(): mysql.Pool | null {
  if (!isLocalMysqlConfigured()) {
    return null;
  }

  if (mockLocalDbInstance) {
    return null;
  }

  if (!localPool) {
    if (ENV.localMysqlUrl) {
      localPool = mysql.createPool({
        uri: ENV.localMysqlUrl,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    } else {
      localPool = mysql.createPool({
        host: ENV.localMysqlHost,
        port: ENV.localMysqlPort || 3306,
        user: ENV.localMysqlUser,
        password: ENV.localMysqlPassword || "",
        database: ENV.localMysqlDatabase,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    }
  }

  return localPool;
}

/**
 * الحصول على كائن Drizzle ORM لقاعدة MySQL المحلية
 */
export function getLocalDb(): MySql2Database<typeof schema> | null {
  if (mockLocalDbInstance) {
    return mockLocalDbInstance;
  }

  const pool = getLocalMysqlPool();
  if (!pool) {
    return null;
  }

  if (!localDrizzleDb) {
    localDrizzleDb = drizzle(pool, { schema, mode: "default" });
  }

  return localDrizzleDb;
}

/**
 * فحص اتصال قاعدة بيانات MySQL المحلية
 */
export async function testLocalMysqlConnection(): Promise<{
  connected: boolean;
  message: string;
  error?: string;
}> {
  if (mockLocalDbInstance) {
    return {
      connected: true,
      message: "الاتصال بقاعدة MySQL المحلية نشط (بيئة الاختبار)",
    };
  }

  if (!isLocalMysqlConfigured()) {
    return {
      connected: false,
      message: "قاعدة MySQL المحلية غير مهيأة (LOCAL_MYSQL_NOT_CONFIGURED). يرجى تعيين متغيرات الاتصال في ملف البيئة.",
      error: "LOCAL_MYSQL_NOT_CONFIGURED",
    };
  }

  try {
    const pool = getLocalMysqlPool();
    if (!pool) {
      return {
        connected: false,
        message: "تعذر إنشاء مجمع اتصالات Local MySQL",
        error: "POOL_CREATION_FAILED",
      };
    }

    const [rows] = await pool.query("SELECT 1 AS ping");
    return {
      connected: true,
      message: "تم الاتصال بقاعدة MySQL المحلية بنجاح",
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `فشل الاتصال بقاعدة MySQL المحلية: ${err?.message || "خطأ غير معروف"}`,
      error: err?.code || err?.message,
    };
  }
}

/**
 * إعادة تعيين الاتصال (للاختبارات أو إعادة التهيئة)
 */
export function resetLocalMysqlPool(): void {
  if (localPool) {
    localPool.end().catch(() => {});
    localPool = null;
  }
  localDrizzleDb = null;
  mockLocalDbInstance = null;
}

/**
 * تعيين كائن وهمي للاختبارات الآلية
 */
export function setMockLocalDb(mockDb: any): void {
  mockLocalDbInstance = mockDb;
}
