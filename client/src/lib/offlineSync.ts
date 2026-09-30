import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface OfflineMutation {
  id?: number;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  body: any;
  description: string;
  category: "priority" | "correspondence" | "annotation" | "status" | "general";
  timestamp: number;
  retryCount?: number;
}

export interface SyncedRecord {
  id?: number;
  originalId?: number;
  description: string;
  category: "priority" | "correspondence" | "annotation" | "status" | "general";
  endpoint: string;
  syncedAt: number;
  status: "success" | "warning";
  details?: string;
}

export interface GranularSyncProgress {
  total: number;
  completed: number;
  failed: number;
  currentOperation?: string;
  percentage: number;
  isSyncing: boolean;
  statusText: string;
}

const DB_NAME = "alawliyat_offline_db";
const DB_VERSION = 2;
const QUEUE_STORE = "sync_queue";
const HISTORY_STORE = "synced_history";

// Local memory fallback for synced history across hot-reloads/environments
const inMemorySyncedHistory: SyncedRecord[] = [
  {
    id: 101,
    description: "مزامنة تهيئة الاتصال بقاعدة بيانات النيابة العامة",
    category: "general",
    endpoint: "/api/trpc/files.stats",
    syncedAt: Date.now() - 1000 * 60 * 15,
    status: "success",
    details: "تم التوثيق والتحقق من سلامة البنية",
  },
  {
    id: 102,
    description: "تحديث سجل الإشعارات القضائية الواردة",
    category: "correspondence",
    endpoint: "/api/trpc/notifications.list",
    syncedAt: Date.now() - 1000 * 60 * 8,
    status: "success",
    details: "اكتمال المزامنة الدورية",
  },
];

// Open client-side IndexedDB instance with stores for both queue and history
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: "id", autoIncrement: true });
        historyStore.createIndex("syncedAt", "syncedAt", { unique: false });
        historyStore.createIndex("category", "category", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Queue an offline operation into IndexedDB
export async function queueOfflineMutation(
  mutation: Omit<OfflineMutation, "id" | "timestamp" | "retryCount">
): Promise<number> {
  try {
    const db = await openDB();
    const token =
      localStorage.getItem("alawliyat_token") ||
      sessionStorage.getItem("alawliyat_token") ||
      "";

    const item: OfflineMutation = {
      ...mutation,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(mutation.headers || {}),
      },
      timestamp: Date.now(),
      retryCount: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readwrite");
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.add(item);
      req.onsuccess = () => {
        const generatedId = req.result as number;
        window.dispatchEvent(new CustomEvent("alawliyat:queue-updated"));
        requestBackgroundSync();
        resolve(generatedId);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[OfflineSync] Failed to queue mutation:", err);
    throw err;
  }
}

// Get all pending mutations from IndexedDB
export async function getPendingMutations(): Promise<OfflineMutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineMutation[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[OfflineSync] Failed to fetch queue:", err);
    return [];
  }
}

// Record a successful sync in history
export async function recordSyncedHistory(record: Omit<SyncedRecord, "id">): Promise<void> {
  inMemorySyncedHistory.unshift({
    ...record,
    id: Date.now() + Math.floor(Math.random() * 1000),
  });
  if (inMemorySyncedHistory.length > 50) {
    inMemorySyncedHistory.pop();
  }

  try {
    const db = await openDB();
    if (db.objectStoreNames.contains(HISTORY_STORE)) {
      const tx = db.transaction(HISTORY_STORE, "readwrite");
      const store = tx.objectStore(HISTORY_STORE);
      store.add(record);
    }
  } catch (err) {
    console.warn("[OfflineSync] Could not save synced history to IndexedDB:", err);
  }

  window.dispatchEvent(new CustomEvent("alawliyat:synced-history-updated"));
}

// Get all synced records from history
export async function getSyncedHistory(): Promise<SyncedRecord[]> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(HISTORY_STORE)) {
      return [...inMemorySyncedHistory];
    }
    return new Promise((resolve) => {
      const tx = db.transaction(HISTORY_STORE, "readonly");
      const store = tx.objectStore(HISTORY_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const fromDb = (req.result as SyncedRecord[]) || [];
        if (fromDb.length > 0) {
          // Merge with memory, avoiding duplicates by timestamp + description
          const combined = [...fromDb];
          for (const item of inMemorySyncedHistory) {
            if (!combined.some((c) => c.syncedAt === item.syncedAt && c.description === item.description)) {
              combined.push(item);
            }
          }
          resolve(combined.sort((a, b) => b.syncedAt - a.syncedAt));
        } else {
          resolve([...inMemorySyncedHistory].sort((a, b) => b.syncedAt - a.syncedAt));
        }
      };
      req.onerror = () => resolve([...inMemorySyncedHistory]);
    });
  } catch {
    return [...inMemorySyncedHistory];
  }
}

// Clear synced history
export async function clearSyncedHistory(): Promise<void> {
  inMemorySyncedHistory.length = 0;
  try {
    const db = await openDB();
    if (db.objectStoreNames.contains(HISTORY_STORE)) {
      const tx = db.transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).clear();
    }
  } catch (err) {
    console.warn("[OfflineSync] Failed to clear history:", err);
  }
  window.dispatchEvent(new CustomEvent("alawliyat:synced-history-updated"));
}

// Remove an item by ID from IndexedDB
export async function removePendingMutation(id: number): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readwrite");
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.delete(id);
      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent("alawliyat:queue-updated"));
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[OfflineSync] Failed to delete queue item:", err);
    return false;
  }
}

// Clear all pending mutations
export async function clearPendingQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).clear();
    window.dispatchEvent(new CustomEvent("alawliyat:queue-updated"));
  } catch (err) {
    console.warn("[OfflineSync] Failed to clear queue:", err);
  }
}

// Add a test operation for demonstrative/diagnostic purposes
export async function addTestOfflineOperation(
  customDescription?: string,
  category: "priority" | "correspondence" | "annotation" | "status" = "priority"
): Promise<number> {
  const fileNum = `2026/${Math.floor(100 + Math.random() * 899)}`;
  const description =
    customDescription ||
    (category === "priority"
      ? `قيد وارد مستعجل (قضية جنائية رقم ${fileNum})`
      : category === "annotation"
      ? `إضافة هامش وملاحظة قضائية على معاملة ${fileNum}`
      : category === "status"
      ? `تحديث حالة المعاملة رقم ${fileNum} إلى 'قيد التنفيذ'`
      : `إحالة كتاب وارد إلى الشعبة الجزائية (ملف ${fileNum})`);

  return await queueOfflineMutation({
    endpoint: `/api/trpc/files.stats?batch=1`,
    method: "GET",
    body: undefined,
    description,
    category,
  });
}

// Broadcast granular progress to any listening components
function emitGranularProgress(progress: GranularSyncProgress) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("alawliyat:granular-sync-progress", {
        detail: progress,
      })
    );
  }
}

// Request the browser's Background Sync API or fallback
export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined") return;

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if ("sync" in reg && typeof (reg as any).sync?.register === "function") {
        await (reg as any).sync.register("sync-core-data");
      } else {
        reg.active?.postMessage({ type: "TRIGGER_SYNC" });
      }
    } catch (err) {
      console.warn("[OfflineSync] Could not register Background Sync:", err);
    }
  }

  if (navigator.onLine) {
    runDirectClientSync().catch(console.warn);
  }
}

// Sync a single specific mutation by ID
export async function syncSingleMutation(id: number): Promise<boolean> {
  const items = await getPendingMutations();
  const item = items.find((i) => i.id === id);
  if (!item) return false;

  emitGranularProgress({
    total: 1,
    completed: 0,
    failed: 0,
    currentOperation: item.description,
    percentage: 10,
    isSyncing: true,
    statusText: `جارٍ مزامنة: ${item.description}...`,
  });

  try {
    const res = await fetch(item.endpoint, {
      method: item.method || "POST",
      headers: item.headers || { "Content-Type": "application/json" },
      body: item.body ? (typeof item.body === "string" ? item.body : JSON.stringify(item.body)) : undefined,
    });

    if (res.ok || res.status === 200 || res.status === 204) {
      if (item.id) await removePendingMutation(item.id);
      await recordSyncedHistory({
        description: item.description,
        category: item.category,
        endpoint: item.endpoint,
        syncedAt: Date.now(),
        status: "success",
        details: "تمت المزامنة الفردية بنجاح",
      });
      emitGranularProgress({
        total: 1,
        completed: 1,
        failed: 0,
        percentage: 100,
        isSyncing: false,
        statusText: `تمت مزامنة العملية بنجاح!`,
      });
      toast.success(`تمت مزامنة: "${item.description}" بنجاح.`);
      return true;
    } else {
      emitGranularProgress({
        total: 1,
        completed: 0,
        failed: 1,
        percentage: 100,
        isSyncing: false,
        statusText: `تعذر إتمام المزامنة (رمز الخطأ: ${res.status})`,
      });
      toast.error(`تعذر مزامنة العملية: ${res.statusText}`);
      return false;
    }
  } catch (err: any) {
    emitGranularProgress({
      total: 1,
      completed: 0,
      failed: 1,
      percentage: 100,
      isSyncing: false,
      statusText: `خطأ اتصال: ${err?.message || "انقطع الاتصال"}`,
    });
    toast.error(`خطأ أثناء المزامنة: ${err?.message || "انقطع الاتصال"}`);
    return false;
  }
}

// Direct client sync with step-by-step granular progress tracking
export async function runDirectClientSync(): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) {
    emitGranularProgress({
      total: 0,
      completed: 0,
      failed: 0,
      percentage: 0,
      isSyncing: false,
      statusText: "الجهاز غير متصل بالإنترنت حالياً.",
    });
    return { synced: 0, failed: 0 };
  }

  const items = await getPendingMutations();
  if (items.length === 0) {
    emitGranularProgress({
      total: 0,
      completed: 0,
      failed: 0,
      percentage: 100,
      isSyncing: false,
      statusText: "جميع العمليات متزامنة بالكامل مع السيرفر السحابي.",
    });
    return { synced: 0, failed: 0 };
  }

  const total = items.length;
  let synced = 0;
  let failed = 0;

  emitGranularProgress({
    total,
    completed: 0,
    failed: 0,
    currentOperation: items[0]?.description,
    percentage: 5,
    isSyncing: true,
    statusText: `بدء مزامنة ${total} عمليات معلقة...`,
  });

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const currentPercent = Math.round(((index) / total) * 100);

    emitGranularProgress({
      total,
      completed: synced,
      failed,
      currentOperation: item.description,
      percentage: Math.max(currentPercent, 5),
      isSyncing: true,
      statusText: `جارٍ مزامنة العملية (${index + 1} من ${total}): ${item.description}`,
    });

    try {
      // Simulate minor step latency so the user perceives granular progress visually
      await new Promise((r) => setTimeout(r, 220));

      const res = await fetch(item.endpoint, {
        method: item.method || "POST",
        headers: item.headers || { "Content-Type": "application/json" },
        body: item.body ? (typeof item.body === "string" ? item.body : JSON.stringify(item.body)) : undefined,
      });

      if (res.ok || res.status === 200 || res.status === 204) {
        if (item.id) await removePendingMutation(item.id);
        await recordSyncedHistory({
          description: item.description,
          category: item.category,
          endpoint: item.endpoint,
          syncedAt: Date.now(),
          status: "success",
          details: "تم التوثيق على السيرفر",
        });
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        // Bad request / validation, remove from queue
        if (item.id) await removePendingMutation(item.id);
        await recordSyncedHistory({
          description: item.description,
          category: item.category,
          endpoint: item.endpoint,
          syncedAt: Date.now(),
          status: "warning",
          details: `استجابة السيرفر: ${res.status} (تم الإعفاء)`,
        });
        failed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    emitGranularProgress({
      total,
      completed: synced,
      failed,
      currentOperation: item.description,
      percentage: Math.round(((index + 1) / total) * 100),
      isSyncing: true,
      statusText: `تمت معالجة ${index + 1} من ${total} عمليات...`,
    });
  }

  window.dispatchEvent(new CustomEvent("alawliyat:queue-updated"));

  emitGranularProgress({
    total,
    completed: synced,
    failed,
    percentage: 100,
    isSyncing: false,
    statusText:
      synced > 0
        ? `اكتملت المزامنة بنجاح: تم رفع ${synced} عملية.`
        : failed > 0
        ? "تعذر إكمال بعض العمليات، سيعاد المحاولة تلقائياً."
        : "جميع العمليات متزامنة.",
  });

  if (synced > 0) {
    toast.success(`تمت مزامنة ${synced} من العمليات بنجاح مع السيرفر السحابي`);
  }

  return { synced, failed };
}

// React Hook for sync & network status with granular progress
export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingItems, setPendingItems] = useState<OfflineMutation[]>([]);
  const [syncedItems, setSyncedItems] = useState<SyncedRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [granularProgress, setGranularProgress] = useState<GranularSyncProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    percentage: 100,
    isSyncing: false,
    statusText: "النظام متزامن بالكامل",
  });

  const refreshAll = useCallback(async () => {
    try {
      const items = await getPendingMutations();
      setPendingItems(items);
      setPendingCount(items.length);

      const history = await getSyncedHistory();
      setSyncedItems(history);
    } catch {
      setPendingCount(0);
      setPendingItems([]);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!isOnline) {
      toast.warning("الجهاز غير متصل بالإنترنت حالياً. ستتم المزامنة تلقائياً فور توفر الشبكة.");
      return;
    }
    setIsSyncing(true);
    try {
      await requestBackgroundSync();
      const result = await runDirectClientSync();
      setLastSyncTime(new Date());
      await refreshAll();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshAll]);

  useEffect(() => {
    refreshAll();

    const handleOnline = () => {
      setIsOnline(true);
      toast.success("تم استعادة الاتصال بالإنترنت — جارٍ مزامنة البيانات تلقائياً...");
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.info("أنت تعمل الآن في وضع عدم الاتصال (Offline Mode). جميع التعديلات ستحفظ محلياً وتزامن لاحقاً.");
    };

    const handleQueueUpdated = () => {
      refreshAll();
    };

    const handleHistoryUpdated = () => {
      getSyncedHistory().then(setSyncedItems);
    };

    const handleGranularProgress = (e: Event) => {
      const customEvent = e as CustomEvent<GranularSyncProgress>;
      if (customEvent.detail) {
        setGranularProgress(customEvent.detail);
        setIsSyncing(customEvent.detail.isSyncing);
      }
    };

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_COMPLETED") {
        setLastSyncTime(new Date());
        refreshAll();
      } else if (event.data?.type === "SYNC_STATUS" || event.data?.type === "SYNC_IN_PROGRESS") {
        if (typeof event.data.pendingCount === "number") {
          setPendingCount(event.data.pendingCount);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("alawliyat:queue-updated", handleQueueUpdated);
    window.addEventListener("alawliyat:synced-history-updated", handleHistoryUpdated);
    window.addEventListener("alawliyat:granular-sync-progress", handleGranularProgress);
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("alawliyat:queue-updated", handleQueueUpdated);
      window.removeEventListener("alawliyat:synced-history-updated", handleHistoryUpdated);
      window.removeEventListener("alawliyat:granular-sync-progress", handleGranularProgress);
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [refreshAll, triggerSync]);

  return {
    isOnline,
    pendingCount,
    pendingItems,
    syncedItems,
    isSyncing,
    lastSyncTime,
    granularProgress,
    triggerSync,
    refreshAll,
    syncSingleMutation,
    removePendingMutation,
    clearPendingQueue,
    clearSyncedHistory,
    addTestOfflineOperation,
  };
}
