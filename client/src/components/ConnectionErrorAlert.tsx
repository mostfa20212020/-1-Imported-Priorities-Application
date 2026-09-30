import React, { useEffect, useState } from "react";
import { Database, WifiOff, AlertTriangle, RefreshCw, X, CheckCircle2 } from "lucide-react";

export type ConnectionErrorType = "database" | "network" | null;

interface ErrorState {
  type: ConnectionErrorType;
  title: string;
  message: string;
  details?: string;
  timestamp: number;
}

export function ConnectionErrorAlert() {
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [recoveredMessage, setRecoveredMessage] = useState<string | null>(null);

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
  }, [errorState]);

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      const response = await fetch("/api/trpc/dbStatus?input=%7B%22json%22%3Anull%7D");
      if (response.ok) {
        setErrorState(null);
        setRecoveredMessage("تم الاتصال بنجاح!");
        setTimeout(() => setRecoveredMessage(null), 3000);
      } else {
        throw new Error("HTTP " + response.status);
      }
    } catch {
      // Still failed
    } finally {
      setIsRetrying(false);
    }
  };

  if (recoveredMessage) {
    return (
      <aside
        aria-label="إشعار استعادة الاتصال"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] bg-emerald-700 text-white rounded-xl shadow-2xl p-3.5 flex items-center justify-between border border-emerald-500/30 animate-in fade-in slide-in-from-top-3 duration-300"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span className="text-sm font-medium">{recoveredMessage}</span>
        </div>
      </aside>
    );
  }

  if (!errorState) return null;

  const isDb = errorState.type === "database";

  return (
    <aside
      aria-label="إشعار حالة الاتصال"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[94%] rounded-xl shadow-2xl p-4 border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
        isDb
          ? "bg-amber-950/95 border-amber-600/50 text-amber-50"
          : "bg-rose-950/95 border-rose-600/50 text-rose-50"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`p-2.5 rounded-lg shrink-0 ${
            isDb ? "bg-amber-900/60 text-amber-300" : "bg-rose-900/60 text-rose-300"
          }`}
        >
          {isDb ? <Database className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
        </div>

        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-base tracking-wide flex items-center gap-1.5">
              <span>{errorState.title}</span>
            </h4>
            <button
              onClick={() => setErrorState(null)}
              className="text-white/60 hover:text-white p-1 rounded-md transition-colors"
              title="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-white/90 mt-1 leading-relaxed">{errorState.message}</p>

          {errorState.details && (
            <div className="mt-2 text-xs font-mono bg-black/30 p-2 rounded border border-white/10 text-white/70 overflow-x-auto max-h-20">
              {errorState.details}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={handleManualRetry}
              disabled={isRetrying}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                isDb
                  ? "bg-amber-500 hover:bg-amber-400 text-amber-950"
                  : "bg-rose-500 hover:bg-rose-400 text-rose-950"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              <span>{isRetrying ? "جاري الفحص..." : "إعادة المحاولة الآن"}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default ConnectionErrorAlert;
