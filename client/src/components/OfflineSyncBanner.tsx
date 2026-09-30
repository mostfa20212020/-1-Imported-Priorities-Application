import React, { useState } from "react";
import { Wifi, WifiOff, RefreshCw, Clock, Database, ChevronLeft } from "lucide-react";
import { useSyncStatus } from "../lib/offlineSync";
import { OfflineSyncIndicator } from "./OfflineSyncIndicator";

export const OfflineSyncBanner: React.FC = () => {
  const { isOnline, pendingCount, isSyncing, lastSyncTime, triggerSync, granularProgress } = useSyncStatus();
  const [showModal, setShowModal] = useState(false);

  // If online and no pending items, no disruptive banner needed
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <>
      <div
        dir="rtl"
        className={`w-full px-4 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 shadow-md flex items-center justify-between flex-wrap gap-2 ${
          !isOnline
            ? "bg-amber-600 text-white"
            : "bg-blue-700 text-white"
        }`}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          {!isOnline ? (
            <div className="flex items-center gap-1.5 bg-amber-800/60 px-2.5 py-1 rounded-lg text-xs font-bold">
              <WifiOff size={14} className="animate-pulse" />
              <span>وضع العمل بدون إنترنت (Offline Mode)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-blue-900/60 px-2.5 py-1 rounded-lg text-xs font-bold">
              <Wifi size={14} />
              <span>متصل بالإنترنت</span>
            </div>
          )}

          <span>
            {!isOnline
              ? "البيانات الأساسية متاحة من الذاكرة المحلية (Cache). جميع الإدخالات والتعديلات تحفظ محلياً."
              : isSyncing
              ? granularProgress.statusText
              : "جارٍ استعادة الاتصال ومزامنة العمليات المعلقة في الخلفية."}
          </span>

          {pendingCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-md font-bold text-xs">
              {pendingCount} {pendingCount === 1 ? "عملية بانتظار المزامنة" : "عمليات بانتظار المزامنة"}
            </span>
          )}

          {/* Granular progress bar inside the banner when syncing */}
          {isSyncing && (
            <div className="flex items-center gap-2 bg-blue-950/40 px-2.5 py-1 rounded-lg">
              <div className="w-20 h-2 bg-blue-950/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${granularProgress.percentage}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold">{granularProgress.percentage}%</span>
            </div>
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
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
          >
            <Database size={12} />
            <span>عرض تفاصيل المزامنة</span>
            <ChevronLeft size={12} />
          </button>

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

      {showModal && (
        <OfflineSyncIndicator showModalInitially={true} variant="floating" />
      )}
    </>
  );
};

export const OfflineSyncCompactBadge: React.FC<{ className?: string }> = ({ className = "" }) => {
  return <OfflineSyncIndicator variant="compact" className={className} />;
};
