import React, { useEffect, useState, useCallback } from "react";
import {
  Database,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  X,
  CheckCircle2,
  Server,
  HelpCircle,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type ConnectionErrorType = "database" | "network" | null;

export interface MysqlDiagnosticData {
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
    connectionSource: string;
  };
  error?: {
    code?: string;
    errno?: number;
    sqlState?: string;
    message: string;
    arabicMessage: string;
    recommendation: string;
  };
  activePool?: {
    totalConnections?: number;
    freeConnections?: number;
    queueLength?: number;
  };
  timestamp: string;
}

interface ErrorState {
  type: ConnectionErrorType;
  title: string;
  message: string;
  details?: string;
  timestamp: number;
}

export function ConnectionErrorAlert() {
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [diagnostic, setDiagnostic] = useState<MysqlDiagnosticData | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [recoveredMessage, setRecoveredMessage] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Fetch the server's diagnostic report for MySQL connectivity
  const runDiagnosticCheck = useCallback(async () => {
    setIsRetrying(true);
    try {
      const response = await fetch("/api/diagnostics/mysql", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (response.ok) {
        const data: MysqlDiagnosticData = await response.json();
        setDiagnostic(data);

        if (data.connected) {
          setErrorState(null);
          setRecoveredMessage("تم الاتصال بقاعدة بيانات MySQL بنجاح!");
          setTimeout(() => setRecoveredMessage(null), 3500);
          return true;
        } else {
          // Update the error state with rich diagnostic details from server
          setErrorState((prev) => ({
            type: "database",
            title: "تنبيه: تعذر الاتصال بقاعدة بيانات MySQL",
            message:
              data.error?.arabicMessage ||
              "تعذر إجراء العملية مع قاعدة البيانات (MySQL). يرجى فحص حالة الخادم أو بيانات الاتصال.",
            details: data.error?.message || prev?.details,
            timestamp: Date.now(),
          }));
          return false;
        }
      }
    } catch (err: any) {
      console.warn("[Diagnostic] Failed to query diagnostic endpoint:", err);
    } finally {
      setIsRetrying(false);
    }
    return false;
  }, []);

  useEffect(() => {
    const handleErrorEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        category: "database" | "network";
        message: string;
        details?: string;
      }>;
      const { category, message, details } = customEvent.detail;

      setErrorState({
        type: category,
        title:
          category === "database"
            ? "تنبيه: تعذر الاتصال بقاعدة البيانات"
            : "تنبيه: انقطاع في الاتصال بالشبكة",
        message:
          category === "database"
            ? "تعذر إجراء العملية مع قاعدة البيانات (MySQL). يرجى فحص حالة الخادم أو بيانات الاتصال."
            : "تعذر الوصول إلى الخادم. يرجى التحقق من اتصال الإنترنت، يمكنك متابعة العمل وسيقوم النظام بالمزامنة تلقائيًا.",
        details: details || message,
        timestamp: Date.now(),
      });
      setRecoveredMessage(null);

      // If database error, immediately run diagnostic endpoint to fetch root cause report
      if (category === "database") {
        runDiagnosticCheck();
      }
    };

    const handleRecoveredEvent = () => {
      if (errorState) {
        setErrorState(null);
        setRecoveredMessage("تمت استعادة الاتصال بنجاح!");
        setTimeout(() => setRecoveredMessage(null), 4000);
      }
    };

    const handleOnline = () => {
      handleRecoveredEvent();
    };

    const handleOffline = () => {
      setErrorState({
        type: "network",
        title: "تنبيه: انقطع اتصال الإنترنت",
        message: "أنت الآن في وضع عدم الاتصال (Offline). تم تفعيل التخزين المؤقت المحلي تلقائياً.",
        timestamp: Date.now(),
      });
    };

    window.addEventListener("system-connection-error", handleErrorEvent);
    window.addEventListener("system-connection-recovered", handleRecoveredEvent);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("system-connection-error", handleErrorEvent);
      window.removeEventListener("system-connection-recovered", handleRecoveredEvent);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [errorState, runDiagnosticCheck]);

  const handleManualRetry = async () => {
    if (errorState?.type === "database") {
      await runDiagnosticCheck();
    } else {
      setIsRetrying(true);
      try {
        const response = await fetch("/api/trpc/dbStatus?input=%7B%22json%22%3Anull%7D");
        if (response.ok) {
          setErrorState(null);
          setRecoveredMessage("تم الاتصال بنجاح!");
          setTimeout(() => setRecoveredMessage(null), 3000);
        }
      } catch {
        // still offline
      } finally {
        setIsRetrying(false);
      }
    }
  };

  if (recoveredMessage) {
    return (
      <aside
        aria-label="إشعار استعادة الاتصال"
        dir="rtl"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] bg-emerald-700 text-white rounded-xl shadow-2xl p-3.5 flex items-center justify-between border border-emerald-500/30 animate-in fade-in slide-in-from-top-3 duration-300"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span className="text-sm font-semibold">{recoveredMessage}</span>
        </div>
      </aside>
    );
  }

  if (!errorState) return null;

  const isDb = errorState.type === "database";

  return (
    <aside
      aria-label="إشعار حالة الاتصال"
      dir="rtl"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[94%] rounded-2xl shadow-2xl p-4 sm:p-5 border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
        isDb
          ? "bg-slate-950/95 border-amber-600/50 text-slate-100"
          : "bg-slate-950/95 border-rose-600/50 text-slate-100"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            isDb
              ? "bg-amber-950/80 text-amber-400 border border-amber-700/50"
              : "bg-rose-950/80 text-rose-400 border border-rose-700/50"
          }`}
        >
          {isDb ? <Database className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
        </div>

        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <span>{errorState.title}</span>
              {diagnostic && isDb && (
                <span className="text-[11px] font-mono text-amber-400">
                  [{diagnostic.error?.code || "MYSQL_DISCONNECTED"}]
                </span>
              )}
            </h4>
            <button
              onClick={() => setErrorState(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="إغلاق التنبيه"
              aria-label="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-200 mt-1.5 leading-relaxed">
            {diagnostic?.error?.arabicMessage || errorState.message}
          </p>

          {/* Actionable recommendation from the diagnostic report */}
          {diagnostic?.error?.recommendation && isDb && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200/90 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-300 font-semibold mb-0.5">
                  إجراء مقترح لحل المشكلة:
                </strong>
                <span>{diagnostic.error.recommendation}</span>
              </div>
            </div>
          )}

          {/* Collapsible Technical Diagnostics Summary */}
          {diagnostic && isDb && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Server size={12} />
                <span>تقرير الفحص والتشخيص الفني (Diagnostic Report)</span>
                {showTechnicalDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showTechnicalDetails && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/40 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">خادم MySQL:</span>
                    <span className="text-white font-semibold">
                      {diagnostic.config.host}:{diagnostic.config.port}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">قاعدة البيانات:</span>
                    <span>{diagnostic.config.database}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">المستخدم والمصدر:</span>
                    <span>
                      {diagnostic.config.user} ({diagnostic.config.connectionSource})
                    </span>
                  </div>
                  {diagnostic.latencyMs !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">زمن الاستجابة:</span>
                      <span>{diagnostic.latencyMs}ms</span>
                    </div>
                  )}
                  {diagnostic.error?.code && (
                    <div className="flex items-center justify-between text-amber-400">
                      <span className="text-slate-500">رمز الخطأ:</span>
                      <span>{diagnostic.error.code}</span>
                    </div>
                  )}
                  {diagnostic.error?.message && (
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400 break-all">
                      {diagnostic.error.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Toolbar */}
          <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
            <div className="text-[11px] text-slate-400">
              <span>وضع النظام: </span>
              <strong className="text-slate-300">
                {isDb ? "ذاكرة احتياطية محلية (In-Memory Fallback)" : "أوفلاين محلي"}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRetry}
                disabled={isRetrying}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-95 ${
                  isDb
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                    : "bg-rose-500 hover:bg-rose-400 text-white"
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                <span>{isRetrying ? "جاري الفحص والتشخيص..." : "إعادة المحاولة والفحص"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default ConnectionErrorAlert;
