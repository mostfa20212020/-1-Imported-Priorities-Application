import { pool } from "./db";
import fs from "node:fs";

export interface MysqlDiagnosticReport {
  connected: boolean;
  status: "connected" | "degraded" | "disconnected";
  latencyMs?: number;
  serverVersion?: string;
  config: {
    host: string;
    port: number;
    database: string;
    user: string;
    hasPassword: boolean;
    isUnixSocket: boolean;
    connectionSource: "MYSQL_URL" | "DATABASE_URL" | "SQL_HOST" | "DEFAULT_LOCAL";
  };
  error?: {
    code?: string;
    errno?: number;
    sqlState?: string;
    message: string;
    arabicMessage: string;
    recommendation: string;
  };
  activePool: {
    totalConnections?: number;
    freeConnections?: number;
    queueLength?: number;
  };
  timestamp: string;
}

/**
 * Executes a live diagnostic check on MySQL database connectivity
 * and produces a detailed status report with error categorizations and recommendations.
 */
export async function checkMysqlDiagnostic(): Promise<MysqlDiagnosticReport> {
  const start = Date.now();
  const rawDbUrl = (process.env.MYSQL_URL || process.env.DATABASE_URL)?.trim();
  const rawHost = process.env.MYSQL_HOST || process.env.SQL_HOST;
  const isCloudSqlDir = Boolean(rawHost && (rawHost.includes("cloudsql") || rawHost.includes("PGSQL")));
  let isUnixSocket = false;
  if (rawHost && rawHost.startsWith("/") && !isCloudSqlDir) {
    try {
      isUnixSocket = fs.existsSync(rawHost) && fs.statSync(rawHost).isSocket();
    } catch {
      isUnixSocket = false;
    }
  }
  const port = process.env.MYSQL_PORT
    ? Number(process.env.MYSQL_PORT)
    : process.env.SQL_PORT && !isNaN(Number(process.env.SQL_PORT))
    ? Number(process.env.SQL_PORT)
    : 3306;
  const host = isUnixSocket ? rawHost! : rawHost && !rawHost.startsWith("/") ? rawHost : "127.0.0.1";
  const database = process.env.MYSQL_DATABASE || process.env.SQL_DB_NAME || "idaratalawliyat";
  const user = process.env.MYSQL_USER || process.env.SQL_USER || "root";
  const hasPassword = Boolean(process.env.MYSQL_PASSWORD || process.env.SQL_PASSWORD);

  const configInfo: MysqlDiagnosticReport["config"] = {
    host: isUnixSocket ? "Unix Socket: " + host : host,
    port,
    database,
    user,
    hasPassword,
    isUnixSocket,
    connectionSource: process.env.MYSQL_URL
      ? "MYSQL_URL"
      : process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.SQL_HOST
      ? "SQL_HOST"
      : "DEFAULT_LOCAL",
  };

  try {
    if (!pool) {
      return {
        connected: false,
        status: "disconnected",
        config: configInfo,
        error: {
          code: "NO_POOL",
          message: "MySQL pool is not initialized",
          arabicMessage: "لم يتم تهيئة مجمع اتصالات خادم MySQL",
          recommendation: "يرجى التحقق من متغيرات البيئة الخاصة بقاعدة البيانات",
        },
        activePool: {},
        timestamp: new Date().toISOString(),
      };
    }

    // Ping MySQL with a lightweight query and a strict timeout (3.5s)
    const [rows]: any = await Promise.race([
      pool.query("SELECT 1 AS ping, VERSION() AS version, CURRENT_TIMESTAMP() AS serverTime"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("ETIMEDOUT: Connection test timed out after 3500ms")),
          3500
        )
      ),
    ]);

    const latencyMs = Date.now() - start;
    const version = rows?.[0]?.version || "MySQL Compatible";

    return {
      connected: true,
      status: "connected",
      latencyMs,
      serverVersion: version,
      config: configInfo,
      activePool: {
        totalConnections: (pool as any)?.pool?._allConnections?.length ?? 1,
        freeConnections: (pool as any)?.pool?._freeConnections?.length ?? 1,
        queueLength: (pool as any)?.pool?._connectionQueue?.length ?? 0,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const errCode =
      err?.code || (err?.message?.includes("ETIMEDOUT") ? "ETIMEDOUT" : "UNKNOWN_ERROR");

    let arabicMessage = "تعذر الاتصال بخادم قاعدة بيانات MySQL.";
    let recommendation = "يرجى فحص خادم MySQL وبيانات الاتصال.";

    if (errCode === "ECONNREFUSED") {
      arabicMessage = `تم رفض الاتصال بالخادم (Connection Refused على ${host}:${port}). خادم MySQL غير مشغّل أو لا يستمع للمنفذ المحدد.`;
      recommendation = `تأكد من تشغيل خدمة MySQL محلياً عبر (sudo service mysql start) أو التحقق من المنفذ ${port}.`;
    } else if (errCode === "ER_ACCESS_DENIED_ERROR") {
      arabicMessage = `خطأ في المصادقة: اسم المستخدم (${user}) أو كلمة المرور غير صحيحة.`;
      recommendation =
        "يرجى التأكد من صحة بيانات الدخول في متغيرات البيئة (MYSQL_USER, MYSQL_PASSWORD).";
    } else if (errCode === "ER_BAD_DB_ERROR") {
      arabicMessage = `قاعدة البيانات '${database}' غير موجودة على الخادم.`;
      recommendation = `يرجى إنشاء قاعدة البيانات أولاً عبر الأمر (CREATE DATABASE ${database};).`;
    } else if (errCode === "ETIMEDOUT" || err?.message?.includes("timed out")) {
      arabicMessage = `انتهت مهلة انتظار الاتصال بقاعدة البيانات (${latencyMs}ms). الخادم بطيء أو يوجد جدار حماية (Firewall) يحجب الاتصال.`;
      recommendation =
        "يرجى التحقق من اتصال الشبكة وإعدادات الجدار الناري والتأكد من إمكانية الوصول للمنفذ.";
    } else if (errCode === "ENOTFOUND") {
      arabicMessage = `تعذر العثور على عنوان الخادم المحدد (${host}).`;
      recommendation = "يرجى التحقق من صحة عنوان الخادم (Host) في ملف الإعدادات.";
    }

    return {
      connected: false,
      status: "disconnected",
      latencyMs,
      config: configInfo,
      error: {
        code: errCode,
        errno: err?.errno,
        sqlState: err?.sqlState,
        message: err?.message || String(err),
        arabicMessage,
        recommendation,
      },
      activePool: {},
      timestamp: new Date().toISOString(),
    };
  }
}
