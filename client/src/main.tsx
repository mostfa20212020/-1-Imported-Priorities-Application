import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

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

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    const msg = (error as any)?.message || "";
    if (
      msg === "Failed to fetch" ||
      msg.includes("aborted") ||
      msg.includes("NetworkError") ||
      msg.includes("تعذر الاتصال بالخادم")
    ) {
      console.warn("[API Query Network Notice]", msg);
    } else {
      console.error("[API Query Error]", error);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
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
              JSON.stringify([
                {
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
                },
              ]),
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
            JSON.stringify([
              {
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
              },
            ]),
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
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
