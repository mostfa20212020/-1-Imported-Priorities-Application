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

const DB_NAME = "alawliyat_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "sync_queue";

// Open client-side IndexedDB instance
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("status", "status", { unique: false });
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
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
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
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineMutation[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[OfflineSync] Failed to fetch queue:", err);
    return [];
  }
}

// Remove an item by ID from IndexedDB
export async function removePendingMutation(id: number): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
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

// Request the browser's Background Sync API or fallback
export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined") return;

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // Check if SyncManager is available
      if ("sync" in reg && typeof (reg as any).sync?.register === "function") {
        await (reg as any).sync.register("sync-core-data");
        console.log("[OfflineSync] Background Sync registered with tag 'sync-core-data'");
      } else {
        // Post message directly to active worker
        reg.active?.postMessage({ type: "TRIGGER_SYNC" });
      }
    } catch (err) {
      console.warn("[OfflineSync] Could not register Background Sync:", err);
    }
  }

  // If already online, trigger direct client-side sync immediately
  if (navigator.onLine) {
    runDirectClientSync().catch(console.warn);
  }
}

// Direct client sync (works in any browser, including Safari & iOS where Background Sync API isn't present)
export async function runDirectClientSync(): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const items = await getPendingMutations();
  if (items.length === 0) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method || "POST",
        headers: item.headers || { "Content-Type": "application/json" },
        body: item.body ? (typeof item.body === "string" ? item.body : JSON.stringify(item.body)) : undefined,
      });

      if (res.ok) {
        if (item.id) await removePendingMutation(item.id);
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        // Bad request / validation, remove from queue
        if (item.id) await removePendingMutation(item.id);
        failed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  window.dispatchEvent(new CustomEvent("alawliyat:queue-updated"));

  if (synced > 0) {
    toast.success(`تمت مزامنة ${synced} من العمليات بنجاح مع السيرفر السحابي`);
  }

  return { synced, failed };
}

// React Hook for sync & network status
export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const items = await getPendingMutations();
      setPendingCount(items.length);
    } catch {
      setPendingCount(0);
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
      await refreshCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshCount]);

  useEffect(() => {
    refreshCount();

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
      refreshCount();
    };

    // Listen for Service Worker postMessages
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_COMPLETED") {
        setLastSyncTime(new Date());
        refreshCount();
        if (event.data.syncedCount > 0) {
          toast.success(`تمت مزامنة ${event.data.syncedCount} عملية في الخلفية.`);
        }
      } else if (event.data?.type === "SYNC_STATUS" || event.data?.type === "SYNC_IN_PROGRESS") {
        if (typeof event.data.pendingCount === "number") {
          setPendingCount(event.data.pendingCount);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("alawliyat:queue-updated", handleQueueUpdated);
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("alawliyat:queue-updated", handleQueueUpdated);
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [refreshCount, triggerSync]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
    triggerSync,
    refreshCount,
  };
}
