// =============================================================================
// Background Sync & Offline Queue Worker for إدارة الأوليات (Public Prosecution)
// =============================================================================

const DB_NAME = "alawliyat_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "sync_queue";

// Open or initialize IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Read all pending items from IndexedDB
async function getPendingQueue() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[SW-Sync] Error reading queue:", err);
    return [];
  }
}

// Remove an item from the queue
async function removeQueueItem(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[SW-Sync] Error deleting queue item:", err);
  }
}

// Notify all open client windows
async function notifyClients(message) {
  try {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage(message);
    }
  } catch (e) {
    console.warn("[SW-Sync] Failed to notify clients:", e);
  }
}

// Process pending queue and replay mutations to server
async function processSyncQueue() {
  const items = await getPendingQueue();
  if (!items || items.length === 0) {
    await notifyClients({ type: "SYNC_STATUS", pendingCount: 0 });
    return 0;
  }

  console.log(`[SW-Sync] Processing ${items.length} pending offline items...`);
  await notifyClients({ type: "SYNC_IN_PROGRESS", pendingCount: items.length });

  let successCount = 0;
  for (const item of items) {
    try {
      const headers = Object.assign(
        { "Content-Type": "application/json" },
        item.headers || {}
      );

      const response = await fetch(item.endpoint, {
        method: item.method || "POST",
        headers: headers,
        body: item.body ? (typeof item.body === "string" ? item.body : JSON.stringify(item.body)) : undefined,
      });

      if (response.ok) {
        await removeQueueItem(item.id);
        successCount++;
        console.log(`[SW-Sync] Synced item #${item.id} (${item.description || item.endpoint})`);
      } else {
        console.warn(`[SW-Sync] Sync failed for #${item.id} with status ${response.status}`);
        // If 4xx client validation error, remove so it doesn't block future syncs
        if (response.status >= 400 && response.status < 500) {
          await removeQueueItem(item.id);
        }
      }
    } catch (err) {
      console.warn(`[SW-Sync] Network retry needed for #${item.id}:`, err);
      // Keep in queue for next sync retry
    }
  }

  const remaining = await getPendingQueue();
  await notifyClients({
    type: "SYNC_COMPLETED",
    syncedCount: successCount,
    remainingCount: remaining.length,
    timestamp: Date.now(),
  });

  // Display notification if supported & permitted
  if (successCount > 0 && self.Notification && Notification.permission === "granted") {
    try {
      self.registration.showNotification("إدارة الأوليات - النيابة العامة", {
        body: `تمت مزامنة ${successCount} من المعاملات والتعديلات المحفوظة محلياً بنجاح.`,
        icon: "/pwa-192x192.png",
        badge: "/favicon.ico",
        tag: "sync-notification",
      });
    } catch {}
  }

  return successCount;
}

// Background Sync Event Listener (Chromium & Android)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-core-data" || event.tag === "alawliyat-sync") {
    console.log("[SW-Sync] Background sync event triggered:", event.tag);
    event.waitUntil(processSyncQueue());
  }
});

// Periodic Sync (where supported by browser)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "sync-core-data" || event.tag === "alawliyat-sync") {
    console.log("[SW-Sync] Periodic sync event triggered");
    event.waitUntil(processSyncQueue());
  }
});

// Message listener from React UI
self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "TRIGGER_SYNC") {
    event.waitUntil(processSyncQueue());
  } else if (event.data.type === "CHECK_QUEUE") {
    getPendingQueue().then((items) => {
      notifyClients({ type: "SYNC_STATUS", pendingCount: items.length });
    });
  } else if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
