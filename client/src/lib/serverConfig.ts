export const DEFAULT_PRODUCTION_SERVER_URL = "https://ais-pre-t2wzhx55boaictgft557tx-50969848752.europe-west2.run.app";
export const DEFAULT_DEV_SERVER_URL = "https://ais-dev-t2wzhx55boaictgft557tx-50969848752.europe-west2.run.app";

const SERVER_STORAGE_KEY = "alawliyat_custom_server_url";

export function isAndroidApk(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "file:" ||
    !window.location.host ||
    window.location.origin === "null" ||
    navigator.userAgent.includes("Android") && window.location.href.startsWith("file:")
  );
}

export function getServerUrl(): string {
  if (typeof window === "undefined") return "";

  try {
    const saved = localStorage.getItem(SERVER_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, "");
    }
  } catch {
    // Local storage not available
  }

  // If running inside Android APK package (local asset)
  if (isAndroidApk()) {
    return DEFAULT_PRODUCTION_SERVER_URL;
  }

  // Running inside standard web browser: relative URL
  return "";
}

export function setCustomServerUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (!clean) {
      localStorage.removeItem(SERVER_STORAGE_KEY);
    } else {
      localStorage.setItem(SERVER_STORAGE_KEY, clean);
    }
    window.dispatchEvent(new CustomEvent("alawliyat_server_url_changed", { detail: clean }));
  } catch (err) {
    console.warn("Could not save server URL:", err);
  }
}

export function resetServerUrlToDefault(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SERVER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("alawliyat_server_url_changed", { detail: "" }));
  } catch (err) {
    console.warn("Could not reset server URL:", err);
  }
}

import { db } from "./firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";

export async function testFirebaseConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const q = query(collection(db, "_system_health"), limit(1));
    await getDocs(q);
    return {
      success: true,
      message: "تم الاتصال بقاعدة بيانات Firebase Firestore بنجاح وبصلاحيات كاملة!",
    };
  } catch (err: any) {
    const msg = err?.message || "";
    if (msg.includes("permission-denied")) {
      return {
        success: false,
        message: "قواعد الأمان (Firestore Rules) ترفض الوصول. يرجى مراجعة rules في Firebase Console.",
      };
    }
    return {
      success: false,
      message: msg || "تعذر الاتصال بـ Firebase Firestore",
    };
  }
}

export async function testServerConnection(urlToCheck?: string): Promise<{
  success: boolean;
  message: string;
  dbConnected?: boolean;
  mode?: string;
}> {
  const target = (urlToCheck !== undefined ? urlToCheck.trim().replace(/\/+$/, "") : getServerUrl());
  const endpoint = `${target}/api/trpc/dbStatus`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        message: `رد السيرفر برمز خطأ (${response.status})`,
      };
    }

    const data = await response.json();
    const result = data?.result?.data?.json || data?.result?.data || data;

    return {
      success: true,
      message: "تم الاتصال بالسيرفر وقاعدة البيانات بنجاح!",
      dbConnected: Boolean(result?.connected),
      mode: result?.mode || "متصل",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.name === "AbortError" ? "انتهت مهلة الاتصال بالسيرفر (Timeout)" : (err.message || "تعذر الاتصال بالسيرفر المحدد"),
    };
  }
}
