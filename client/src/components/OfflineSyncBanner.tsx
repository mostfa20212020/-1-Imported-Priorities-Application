import React from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Clock, CloudOff } from "lucide-react";
import { useSyncStatus } from "../lib/offlineSync";

export const OfflineSyncBanner: React.FC = () => {
  const { isOnline, pendingCount, isSyncing, lastSyncTime, triggerSync } = useSyncStatus();

  // If online and no pending items, no disruptive banner needed
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className={`w-full px-4 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 shadow-md flex items-center justify-between flex-wrap gap-2 ${
        !isOnline
          ? "bg-amber-600 text-white"
          : "bg-blue-700 text-white"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {!isOnline ? (
          <div className="flex items-center gap-1.5 bg-amber-800/60 px-2.5 py-1 rounded-full text-xs font-bold">
            <WifiOff size={14} className="animate-pulse" />
            <span>وضع العمل بدون إنترنت (Offline Mode)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-blue-900/60 px-2.5 py-1 rounded-full text-xs font-bold">
            <Wifi size={14} />
            <span>متصل بالإنترنت</span>
          </div>
        )}

        <span>
          {!isOnline
            ? "البيانات الأساسية متاحة من الذاكرة المحلية (Cache). جميع الإدخالات والتعديلات تحفظ محلياً."
            : "جارٍ استعادة الاتصال ومزامنة العمليات المعلقة في الخلفية."}
        </span>

        {pendingCount > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-md font-bold text-xs">
            {pendingCount} {pendingCount === 1 ? "عملية بانتظار المزامنة" : "عمليات بانتظار المزامنة"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {lastSyncTime && (
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] opacity-80">
            <Clock size={12} />
            آخر مزامنة: {lastSyncTime.toLocaleTimeString("ar-OM", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}

        <button
          onClick={() => triggerSync()}
          disabled={isSyncing || !isOnline}
          className="inline-flex items-center gap-1.5 bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-50 px-3 py-1 rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
          title={!isOnline ? "المزامنة تتطلب اتصالاً بالإنترنت" : "مزامنة العمليات المعلقة فوراً"}
        >
          <RefreshCw size={12} className={isSyncing ? "animate-spin text-blue-600" : ""} />
          <span>{isSyncing ? "جارٍ المزامنة..." : "مزامنة الآن"}</span>
        </button>
      </div>
    </div>
  );
};

export const OfflineSyncCompactBadge: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isOnline, pendingCount, isSyncing, triggerSync } = useSyncStatus();

  return (
    <button
      onClick={() => triggerSync()}
      disabled={isSyncing}
      type="button"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
        !isOnline
          ? "bg-amber-100 text-amber-900 border border-amber-300"
          : pendingCount > 0
          ? "bg-blue-100 text-blue-900 border border-blue-300"
          : "bg-emerald-50 text-emerald-800 border border-emerald-200"
      } ${className}`}
      title={
        !isOnline
          ? "غير متصل بالإنترنت - يتم حفظ التعديلات محلياً"
          : pendingCount > 0
          ? `${pendingCount} عمليات بانتظار المزامنة - اضغط للمزامنة الآن`
          : "البيانات متزامنة بالكامل مع السيرفر السحابي"
      }
    >
      {!isOnline ? (
        <>
          <CloudOff size={13} className="text-amber-600 animate-pulse" />
          <span>أوفلاين ({pendingCount})</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw size={12} className={`text-blue-600 ${isSyncing ? "animate-spin" : ""}`} />
          <span>مزامنة ({pendingCount})</span>
        </>
      ) : (
        <>
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span className="hidden sm:inline">متزامن</span>
        </>
      )}
    </button>
  );
};
