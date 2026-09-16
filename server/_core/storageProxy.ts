import type { Express } from "express";
import { ENV } from "./env";
import { getLocalFile } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Check local fallback storage first
    const local = getLocalFile(key);
    if (local) {
      let contentType = local.contentType;
      if (!contentType || contentType === "application/octet-stream") {
        if (key.toLowerCase().includes(".pdf")) {
          contentType = "application/pdf";
        }
      }
      res.set("Content-Type", contentType || "application/octet-stream");
      if (contentType === "application/pdf") {
        res.set("Content-Disposition", "inline");
      }
      res.set("Access-Control-Allow-Origin", "*");
      res.removeHeader("X-Frame-Options");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(local.data);
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(404).send("File not found in local storage");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
