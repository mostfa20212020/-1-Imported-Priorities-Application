import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { authenticateLocalRequest } from "./localAuth";
import { getIncomingFile, listIncomingFiles, updateIncomingFile } from "../db";
import { getFileBytes, storagePut } from "../storage";
import { generateProsecutionPdf, ensureDefaultPdfs } from "../pdfService";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Direct PDF viewing and downloading endpoints for all incoming files
  app.get("/api/files/:id/pdf", async (req, res) => {
    try {
      const user = await authenticateLocalRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const fileId = Number(req.params.id);
      if (!Number.isFinite(fileId) || fileId <= 0) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }
      const file = await getIncomingFile(fileId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      let pdfBuffer: Buffer | null = null;
      if (file.originalFileKey) {
        pdfBuffer = await getFileBytes(file.originalFileKey);
      }
      if (!pdfBuffer) {
        pdfBuffer = await generateProsecutionPdf(file, "original");
        const stored = await storagePut(
          `incoming/original/${file.year}/${file.fileNumber}.pdf`,
          pdfBuffer,
          "application/pdf"
        );
        await updateIncomingFile(file.id, {
          originalFileKey: stored.key,
          originalFileUrl: stored.url,
        });
      }

      const safeName = file.originalFileName || `وارد_${file.fileNumber.replace(/[\/\\]/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(safeName)}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.removeHeader("X-Frame-Options");
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] View original error:", err);
      res.status(500).json({ error: "Failed to load PDF" });
    }
  });

  app.get("/api/files/:id/signed-pdf", async (req, res) => {
    try {
      const user = await authenticateLocalRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const fileId = Number(req.params.id);
      if (!Number.isFinite(fileId) || fileId <= 0) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }
      const file = await getIncomingFile(fileId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      let pdfBuffer: Buffer | null = null;
      if (file.signedFileKey) {
        pdfBuffer = await getFileBytes(file.signedFileKey);
      }
      if (!pdfBuffer) {
        pdfBuffer = await generateProsecutionPdf(file, "signed");
        const stored = await storagePut(
          `incoming/signed/${file.year}/${file.fileNumber}.pdf`,
          pdfBuffer,
          "application/pdf"
        );
        await updateIncomingFile(file.id, {
          signedFileKey: stored.key,
          signedFileUrl: stored.url,
          isSigned: true,
        });
      }

      const safeName = `وارد_موقّع_${file.fileNumber.replace(/[\/\\]/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(safeName)}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.removeHeader("X-Frame-Options");
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] View signed error:", err);
      res.status(500).json({ error: "Failed to load signed PDF" });
    }
  });

  // Reverse proxy safeguard: Prevent upstream reverse-proxies (like Nginx) from intercepting
  // 403 responses and replacing tRPC JSON error payloads with HTML error pages.
  app.use("/api", (req, res, next) => {
    let currentStatusCode = 200;
    Object.defineProperty(res, "statusCode", {
      get: () => currentStatusCode,
      set: (code: number) => {
        if (code === 403) {
          currentStatusCode = (req.originalUrl && req.originalUrl.includes("/trpc")) ? 200 : 401;
        } else {
          currentStatusCode = code;
        }
      },
      configurable: true,
      enumerable: true,
    });

    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode: number, ...args: any[]) {
      if (statusCode === 403) {
        statusCode = (req.originalUrl && req.originalUrl.includes("/trpc")) ? 200 : 401;
      }
      return (origWriteHead as any)(statusCode, ...args);
    };

    const origStatus = res.status.bind(res);
    res.status = (code: number) => {
      if (code === 403) {
        currentStatusCode = (req.originalUrl && req.originalUrl.includes("/trpc")) ? 200 : 401;
        return origStatus(currentStatusCode);
      }
      return origStatus(code);
    };
    next();
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Catch-all for unmatched /api routes: return JSON 404, never HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({
      error: {
        message: `API endpoint not found: ${req.method} ${req.path}`,
        code: "NOT_FOUND",
      },
    });
  });

  // Global API error handler: ensure API errors always return JSON, never HTML
  app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[API Error]", err);
    const status = typeof err?.status === "number" ? err.status : (err?.statusCode || 500);
    res.status(status).json({
      error: {
        message: err?.message || "Internal Server Error",
        code: err?.code || "INTERNAL_ERROR",
      },
    });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    listIncomingFiles({})
      .then((files) => ensureDefaultPdfs(files))
      .catch((e) => console.warn("[PDF] Seeding error:", e));
  });
}

startServer().catch(console.error);
