import React, { useState } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  CloudOff,
  Database,
  ArrowUpRight,
  FileText,
  PenTool,
  CheckCheck,
  Trash2,
  Plus,
  X,
  Layers,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { useSyncStatus } from "../lib/offlineSync";

interface OfflineSyncIndicatorProps {
  variant?: "floating" | "compact" | "banner" | "button" | "card";
  className?: string;
  showModalInitially?: boolean;
}

export const OfflineSyncIndicator: React.FC<OfflineSyncIndicatorProps> = ({
  variant = "floating",
  className = "",
  showModalInitially = false,
}) => {
  const {
    isOnline,
    pendingCount,
    pendingItems,
    syncedItems,
    isSyncing,
    lastSyncTime,
    granularProgress,
    triggerSync,
    syncSingleMutation,
    removePendingMutation,
    clearPendingQueue,
    clearSyncedHistory,
    addTestOfflineOperation,
  } = useSyncStatus();

  const [isOpen, setIsOpen] = useState<boolean>(showModalInitially);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "synced">("all");
  const [syncingItemId, setSyncingItemId] = useState<number | null>(null);

  const totalTracked = pendingItems.length + syncedItems.length;
  const progressPercent =
    isSyncing
      ? granularProgress.percentage
      : pendingItems.length === 0
      ? 100
      : Math.round((syncedItems.length / Math.max(totalTracked, 1)) * 100);

  const formatTimestamp = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "الآن";
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
    return new Date(ts).toLocaleDateString("ar-OM", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "priority":
        return "وارد قضائي";
      case "correspondence":
        return "مكاتبات ورسائل";
      case "annotation":
        return "هامش وقرار";
      case "status":
        return "تحديث حالة";
      default:
        return "إجراء نظام";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "priority":
        return <FileText size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />;
      case "annotation":
        return <PenTool size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />;
      case "status":
        return <CheckCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />;
      default:
        return <Layers size={14} className="text-slate-600 dark:text-slate-400 shrink-0" />;
    }
  };

  const handleSyncSingle = async (id?: number) => {
    if (!id) return;
    setSyncingItemId(id);
    try {
      await syncSingleMutation(id);
    } finally {
      setSyncingItemId(null);
    }
  };

  // ----------------- Variant: Dedicated Embedded Dashboard Card -----------------
  if (variant === "card") {
    return (
      <div
        dir="rtl"
        className={`w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all ${className}`}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                !isOnline
                  ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400"
                  : isSyncing
                  ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400"
                  : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {isSyncing ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : !isOnline ? (
                <CloudOff size={20} className="animate-pulse" />
              ) : (
                <Database size={20} />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  مؤشر تقدم المزامنة التراكمي (Offline Sync Indicator)
                </h3>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    isOnline
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                  }`}
                >
                  {isOnline ? (
                    <>
                      <Wifi size={11} /> متصل بالإنترنت
                    </>
                  ) : (
                    <>
                      <WifiOff size={11} /> وضع عدم الاتصال (Offline)
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                متابعة دقيقة لكل عملية معلقة محفوظة محلياً والتغييرات المعتمدة بالسيرفر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => addTestOfflineOperation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg border border-blue-200/80 dark:border-blue-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="إضافة عملية تجريبية لاختبار شريط التقدم"
            >
              <Plus size={13} />
              <span>إضافة عملية تجريبية</span>
            </button>

            <button
              type="button"
              onClick={() => triggerSync()}
              disabled={!isOnline || isSyncing}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-lg shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "جارٍ المزامنة..." : "مزامنة الكل الآن"}</span>
            </button>
          </div>
        </div>

        {/* Granular Progress Bar and Metrics */}
        <div className="pt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isSyncing
                ? granularProgress.statusText
                : pendingCount > 0
                ? `توجد ${pendingCount} عملية بانتظار المزامنة التلقائية مع السيرفر`
                : "جميع المعاملات والإجراءات متزامنة وموثقة بالكامل"}
            </span>
            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
              {progressPercent}%
            </span>
          </div>

          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                !isOnline
                  ? "bg-amber-500"
                  : isSyncing
                  ? "bg-linear-to-r from-blue-600 via-indigo-500 to-blue-400 animate-pulse"
                  : pendingCount > 0
                  ? "bg-blue-600"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                عمليات معلقة محلياً
              </span>
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {pendingCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                تغييرات تمت مزامنتها
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {syncedItems.length}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                آخر تدقيق ناجح
              </span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1 block truncate">
                {lastSyncTime
                  ? lastSyncTime.toLocaleTimeString("ar-OM", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "الآن"}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              الكل ({totalTracked})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "pending"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              قيد الانتظار ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("synced")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "synced"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              تمت المزامنة ({syncedItems.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {pendingItems.length > 0 && (
              <button
                type="button"
                onClick={() => clearPendingQueue()}
                className="text-xs text-red-600 dark:text-red-400 hover:underline px-2 py-1"
              >
                تفريغ القائمة المعلقة
              </button>
            )}
            {syncedItems.length > 0 && (
              <button
                type="button"
                onClick={() => clearSyncedHistory()}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline px-2 py-1"
              >
                مسح السجل المكتمل
              </button>
            )}
          </div>
        </div>

        {/* Embedded List */}
        <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pe-1">
          {activeTab === "pending" && pendingItems.length === 0 && (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              <ShieldCheck size={32} className="mx-auto text-emerald-500 mb-1" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                لا توجد عمليات معلقة حالياً
              </p>
            </div>
          )}

          {activeTab === "synced" && syncedItems.length === 0 && (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              <Clock size={32} className="mx-auto text-slate-400 mb-1" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                سجل المزامنة المكتملة فارغ
              </p>
            </div>
          )}

          {/* Pending items */}
          {(activeTab === "all" || activeTab === "pending") &&
            pendingItems.map((item) => (
              <div
                key={`card-pending-${item.id}`}
                className="p-3 rounded-xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {item.description}
                    </h5>
                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        قيد الانتظار
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{getCategoryLabel(item.category)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestamp(item.timestamp)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSyncSingle(item.id)}
                    disabled={!isOnline || isSyncing || syncingItemId === item.id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60 hover:bg-blue-200 rounded-md transition-colors disabled:opacity-40"
                    title="مزامنة الآن"
                  >
                    <RefreshCw
                      size={11}
                      className={syncingItemId === item.id ? "animate-spin" : ""}
                    />
                    <span>مزامنة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => item.id && removePendingMutation(item.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                    title="حذف"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

          {/* Synced items */}
          {(activeTab === "all" || activeTab === "synced") &&
            syncedItems.map((item) => (
              <div
                key={`card-synced-${item.id}`}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                    <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                      {item.description}
                    </h5>
                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        تمت المزامنة
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{getCategoryLabel(item.category)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestamp(item.syncedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-left shrink-0">
                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(item.syncedAt).toLocaleTimeString("ar-OM", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ----------------- Trigger Button / Compact Widget ----------------- */}
      {variant === "compact" ? (
        <button
          onClick={() => setIsOpen(true)}
          type="button"
          aria-label="عرض تفاصيل مزامنة أوفلاين"
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            !isOnline
              ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
              : pendingCount > 0
              ? "bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20"
              : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
          } ${className}`}
        >
          {isSyncing ? (
            <RefreshCw size={13} className="text-blue-600 animate-spin" />
          ) : !isOnline ? (
            <CloudOff size={13} className="text-amber-600 animate-pulse" />
          ) : pendingCount > 0 ? (
            <ArrowUpRight size={13} className="text-blue-600" />
          ) : (
            <CheckCircle2 size={13} className="text-emerald-600" />
          )}

          <span className="hidden sm:inline font-medium">
            {!isOnline
              ? `أوفلاين (${pendingCount})`
              : isSyncing
              ? `جارٍ المزامنة ${granularProgress.percentage}%`
              : pendingCount > 0
              ? `${pendingCount} معلقة`
              : "متزامن"}
          </span>

          {/* Mini progress bar on compact button when syncing */}
          {isSyncing && (
            <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${granularProgress.percentage}%` }}
              />
            </div>
          )}
        </button>
      ) : variant === "button" ? (
        <button
          onClick={() => setIsOpen(true)}
          type="button"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
        >
          <Database size={13} />
          <span>سجل المزامنة</span>
          {pendingCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>
      ) : (
        /* Floating Dock Widget (fixed bottom-right in RTL / bottom-left in LTR) */
        <div
          dir="rtl"
          className={`fixed bottom-4 start-4 z-40 flex flex-col items-start ${className}`}
        >
          <div
            onClick={() => setIsOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setIsOpen(true)}
            className={`cursor-pointer group flex items-center gap-3 px-3.5 py-2.5 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 hover:shadow-xl active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              !isOnline
                ? "bg-slate-900/90 text-amber-300 border-amber-500/40"
                : pendingCount > 0
                ? "bg-slate-900/90 text-blue-200 border-blue-500/40"
                : "bg-slate-900/85 text-slate-200 border-slate-700/60 hover:border-slate-500"
            }`}
          >
            {/* Visual Icon */}
            <div className="relative flex items-center justify-center">
              {isSyncing ? (
                <RefreshCw size={18} className="text-blue-400 animate-spin" />
              ) : !isOnline ? (
                <CloudOff size={18} className="text-amber-400 animate-pulse" />
              ) : pendingCount > 0 ? (
                <Database size={18} className="text-blue-400" />
              ) : (
                <CheckCircle2 size={18} className="text-emerald-400" />
              )}
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -start-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
                  {pendingCount}
                </span>
              )}
            </div>

            {/* Granular Progress Summary Text */}
            <div className="flex flex-col text-right">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {!isOnline
                    ? "وضع العمل غير المتصل (Offline)"
                    : isSyncing
                    ? `مزامنة قيد التنفيذ (${granularProgress.percentage}%)`
                    : pendingCount > 0
                    ? `${pendingCount} تغييرات بانتظار الرفع`
                    : "البيانات متزامنة بالكامل"}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar in floating card */}
              <div className="w-36 h-1.5 mt-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    !isOnline
                      ? "bg-amber-500"
                      : isSyncing
                      ? "bg-blue-500"
                      : pendingCount > 0
                      ? "bg-blue-400"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <span className="text-slate-400 text-xs group-hover:text-white transition-colors">
              <ChevronRight size={14} className="rotate-180" />
            </span>
          </div>
        </div>
      )}

      {/* ----------------- Detailed Granular Sync Modal ----------------- */}
      {isOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    !isOnline
                      ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400"
                      : isSyncing
                      ? "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400"
                      : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {isSyncing ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : !isOnline ? (
                    <CloudOff size={20} />
                  ) : (
                    <Database size={20} />
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>مؤشر المزامنة التراكمية (Sync Center)</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
                        isOnline
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                          : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                      }`}
                    >
                      {isOnline ? (
                        <>
                          <Wifi size={11} /> متصل بالإنترنت
                        </>
                      ) : (
                        <>
                          <WifiOff size={11} /> غير متصل (Offline)
                        </>
                      )}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    إدارة ومتابعة التغييرات المحفوظة محلياً والعمليات المتزامنة مع السيرفر السحابي
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="إغلاق النافذة"
              >
                <X size={18} />
              </button>
            </div>

            {/* Granular Progress Status Card */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-linear-to-b from-slate-50/50 to-transparent dark:from-slate-900/50 shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {isSyncing
                    ? granularProgress.statusText
                    : pendingCount > 0
                    ? `توجد ${pendingCount} عملية بانتظار المزامنة مع السيرفر`
                    : "جميع المعاملات والقرارات متزامنة بالكامل مع السيرفر"}
                </span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {progressPercent}%
                </span>
              </div>

              {/* Enhanced Granular Progress Bar */}
              <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    !isOnline
                      ? "bg-amber-500"
                      : isSyncing
                      ? "bg-linear-to-r from-blue-600 via-indigo-500 to-blue-400 animate-pulse"
                      : pendingCount > 0
                      ? "bg-blue-600"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-center">
                <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/50">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    عمليات معلقة
                  </span>
                  <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                    {pendingCount}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/50">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    تمت مزامنتها
                  </span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {syncedItems.length}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/50">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    آخر تدقيق
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {lastSyncTime
                      ? lastSyncTime.toLocaleTimeString("ar-OM", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "الآن"}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter Tabs (Anti-Slop Segmented Controls) */}
            <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === "all"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  الكل ({totalTracked})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("pending")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === "pending"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  قيد الانتظار ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("synced")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === "synced"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  تمت المزامنة ({syncedItems.length})
                </button>
              </div>

              {/* Action: Add test offline operation to demonstrate granular sync */}
              <button
                type="button"
                onClick={() => addTestOfflineOperation()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                title="إضافة عملية تجريبية لاختبار مؤشر المزامنة"
              >
                <Plus size={13} />
                <span>إضافة عملية تجريبية</span>
              </button>
            </div>

            {/* Scrollable Operations List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* When no items exist in current tab */}
              {activeTab === "pending" && pendingItems.length === 0 && (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <ShieldCheck size={40} className="mx-auto text-emerald-500/80 mb-2" />
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    لا توجد أي عمليات معلقة
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    جميع التعديلات والواردات تم إرسالها وتوثيقها بنجاح في قاعدة البيانات.
                  </p>
                </div>
              )}

              {activeTab === "synced" && syncedItems.length === 0 && (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <Clock size={40} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    سجل المزامنة المكتملة فارغ
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    ستظهر هنا كافة العمليات التي تمت مزامنتها تلقائياً بعد عودة الاتصال.
                  </p>
                </div>
              )}

              {/* 1. Pending Items Render */}
              {(activeTab === "all" || activeTab === "pending") &&
                pendingItems.map((item) => (
                  <div
                    key={`pending-${item.id}`}
                    className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 flex items-start justify-between gap-3 transition-all hover:border-amber-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                        {getCategoryIcon(item.category)}
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {item.description}
                        </h4>
                        {/* Clean unboxed metadata with typographic separators */}
                        <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            قيد الانتظار (محفوظ محلياً)
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{getCategoryLabel(item.category)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimestamp(item.timestamp)}</span>
                          {item.retryCount && item.retryCount > 0 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-red-600 dark:text-red-400">
                                {item.retryCount} محاولات سابقة
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Pending Item Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSyncSingle(item.id)}
                        disabled={!isOnline || isSyncing || syncingItemId === item.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60 hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-40 rounded-lg transition-colors"
                        title={!isOnline ? "يتطلب اتصالاً بالإنترنت" : "مزامنة هذه العملية فوراً"}
                      >
                        <RefreshCw
                          size={12}
                          className={syncingItemId === item.id ? "animate-spin" : ""}
                        />
                        <span className="hidden sm:inline">مزامنة الآن</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => item.id && removePendingMutation(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                        title="حذف العملية من قائمة الانتظار"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

              {/* 2. Synced Items Render */}
              {(activeTab === "all" || activeTab === "synced") &&
                syncedItems.map((item) => (
                  <div
                    key={`synced-${item.id}`}
                    className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-start justify-between gap-3 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                        <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                          {item.description}
                        </h4>
                        {/* Clean unboxed metadata with typographic separators */}
                        <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            تم التوثيق والمزامنة
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{getCategoryLabel(item.category)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimestamp(item.syncedAt)}</span>
                          {item.details && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-400">{item.details}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(item.syncedAt).toLocaleTimeString("ar-OM", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Modal Footer / Control Toolbar */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                {pendingItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearPendingQueue()}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline px-2 py-1"
                  >
                    تفريغ العمليات المعلقة ({pendingCount})
                  </button>
                )}
                {syncedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearSyncedHistory()}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline px-2 py-1"
                  >
                    مسح السجل المكتمل
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  إغلاق
                </button>

                <button
                  type="button"
                  onClick={() => triggerSync()}
                  disabled={!isOnline || isSyncing}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                  <span>{isSyncing ? "جارٍ المزامنة..." : "مزامنة الكل الآن"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineSyncCard: React.FC<{ className?: string }> = ({ className = "" }) => {
  return <OfflineSyncIndicator variant="card" className={className} />;
};

export const OfflineSyncPanel: React.FC<{ className?: string }> = ({ className = "" }) => {
  return <OfflineSyncIndicator variant="card" className={className} />;
};
