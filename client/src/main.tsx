import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { registerSW } from "virtual:pwa-register";
import { getServerUrl } from "./lib/serverConfig";
import App from "./App";
import ConnectionErrorAlert from "./components/ConnectionErrorAlert";
import { startLogin } from "./const";
import "./index.css";

// Register Service Worker with auto-update and background synchronization
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log("[PWA] New version ready, refreshing cache...");
          updateSW(true);
        },
        onOfflineReady() {
          console.log("[PWA] Service worker cached offline shell and core data");
        },
        onRegistered(registration) {
          console.log("[PWA] Service worker registered successfully:", registration?.scope);
          if (registration && "sync" in registration) {
            (registration as any).sync.register("sync-core-data").catch(() => {});
          }
        },
        onRegisterError(error) {
          console.warn("[PWA] Service worker registration error:", error);
        },
      });
    } catch (err) {
      console.warn("[PWA] Could not initialize service worker:", err);
    }
  } else {
    // In development mode, clean up any old service workers from previous builds to prevent caching errors
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (
          error?.data?.code === "UNAUTHORIZED" ||
          error?.data?.code === "FORBIDDEN" ||
          error?.data?.httpStatus === 401 ||
          error?.data?.httpStatus === 403
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized =
    error.message === UNAUTHED_ERR_MSG ||
    error.data?.code === "UNAUTHORIZED" ||
    error.data?.code === "FORBIDDEN" ||
    error.data?.httpStatus === 401 ||
    error.data?.httpStatus === 403;

  if (!isUnauthorized) return;

  try {
    localStorage.removeItem("alawliyat_token");
    sessionStorage.removeItem("alawliyat_token");
    sessionStorage.removeItem("manus-cookie");
    localStorage.removeItem("manus-runtime-user-info");
  } catch {}
};

/**
 * Robust error categorization: differentiates between Network issues and Database connection errors
 * and dispatches UI notifications instead of generic raw console logs.
 */
function handleCategorizedError(error: unknown) {
  redirectToLoginIfUnauthorized(error);
  const msg = (error as any)?.message || String(error || "");
  const lower = msg.toLowerCase();

  // 1. Specific Database connection failure detection
  const isDbError =
    lower.includes("database") ||
    lower.includes("postgres") ||
    lower.includes("econnrefused") ||
    lower.includes("connection terminated") ||
    lower.includes("password authentication failed") ||
    lower.includes("supabase") ||
    lower.includes("query error") ||
    lower.includes("pool error") ||
    msg.includes("قاعدة البيانات");

  // 2. Specific Network interruption failure detection
  const isNetworkError =
    msg === "Failed to fetch" ||
    lower.includes("networkerror") ||
    lower.includes("net::err_") ||
    lower.includes("aborted") ||
    lower.includes("missing result") ||
    lower.includes("load failed") ||
    msg.includes("تعذر الاتصال بالخادم") ||
    (typeof navigator !== "undefined" && !navigator.onLine);

  if (isDbError) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("system-connection-error", {
          detail: {
            category: "database",
            message: "تعذر الاتصال بقاعدة البيانات",
            details: msg,
          },
        })
      );
    }
  } else if (isNetworkError) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("system-connection-error", {
          detail: {
            category: "network",
            message: "انقطاع في الاتصال بالشبكة",
            details: msg,
          },
        })
      );
    }
  }
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    handleCategorizedError(error);
  } else if (event.type === "updated" && event.action.type === "success") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("system-connection-recovered"));
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    handleCategorizedError(error);
  } else if (event.type === "updated" && event.action.type === "success") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("system-connection-recovered"));
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getServerUrl()}/api/trpc`,
      transformer: superjson,
      headers() {
        try {
          const token =
            localStorage.getItem("alawliyat_token") ||
            sessionStorage.getItem("alawliyat_token");
          if (token) {
            return { Authorization: `Bearer ${token}` };
          }
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const cToken = pair?.trim().slice(prefix.length);
            if (cToken) {
              return { Authorization: `Bearer ${cToken}` };
            }
          }
        } catch {
          // storage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        try {
          const response = await globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });

          const contentType = response.headers.get("content-type") || "";
          // Safeguard: If the server or proxy returns HTML (e.g. index.html fallback, 404, or 403/502 page),
          // convert it into a compliant JSON response so tRPC doesn't fail with JSON parse error.
          if (!contentType.includes("application/json")) {
            const isAuthProblem = response.status === 401 || response.status === 403;
            if (isAuthProblem) {
              try {
                localStorage.removeItem("alawliyat_token");
                sessionStorage.removeItem("alawliyat_token");
                sessionStorage.removeItem("manus-cookie");
                localStorage.removeItem("manus-runtime-user-info");
              } catch {}
            }
            return new Response(
              JSON.stringify({
                error: {
                  json: {
                    message: isAuthProblem
                      ? "يرجى تسجيل الدخول للمتابعة"
                      : `خطأ في استجابة الخادم (${response.status})`,
                    code: -32603,
                    data: {
                      code: isAuthProblem ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
                      httpStatus: response.status,
                    },
                  },
                },
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          return response;
        } catch (fetchErr: any) {
          // If fetch failed due to temporary network interruption or server restart,
          // return a graceful JSON response so the application handles it smoothly
          return new Response(
            JSON.stringify({
              error: {
                json: {
                  message: "تعذر الاتصال بالخادم، جاري إعادة المحاولة تلقائيًا...",
                  code: -32603,
                  data: {
                    code: "INTERNAL_SERVER_ERROR",
                    httpStatus: 503,
                  },
                },
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <ConnectionErrorAlert />
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
