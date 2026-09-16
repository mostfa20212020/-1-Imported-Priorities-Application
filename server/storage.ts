// Preconfigured storage helpers for Manus & AI Studio WebDev templates
// Uploads via Forge Server presigned URL to S3 when configured,
// or falls back to local in-memory/disk storage for zero-config offline runs.

import fs from "fs";
import path from "path";
import { ENV } from "./_core/env";

const localFileCache = new Map<string, { data: Buffer; contentType: string }>();
const storageDir = path.resolve(process.cwd(), ".local_storage");

function ensureStorageDir() {
  if (!fs.existsSync(storageDir)) {
    try {
      fs.mkdirSync(storageDir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

export function getLocalFile(key: string): { data: Buffer; contentType: string } | null {
  const normalized = normalizeKey(key);
  if (localFileCache.has(normalized)) {
    return localFileCache.get(normalized)!;
  }
  ensureStorageDir();
  const filePath = path.join(storageDir, normalized.replace(/[/\\]/g, "_"));
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath);
      return { data, contentType: "application/octet-stream" };
    } catch {
      return null;
    }
  }
  return null;
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    return null;
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const buffer = Buffer.isBuffer(data)
    ? data
    : typeof data === "string"
    ? Buffer.from(data)
    : Buffer.from(data as Uint8Array);

  const config = getForgeConfig();

  // If Forge is not configured, store locally
  if (!config) {
    localFileCache.set(key, { data: buffer, contentType });
    ensureStorageDir();
    try {
      fs.writeFileSync(path.join(storageDir, key.replace(/[/\\]/g, "_")), buffer);
    } catch (e) {
      console.warn("Could not persist file to disk:", e);
    }
    return { key, url: `/manus-storage/${key}` };
  }

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", config.forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${config.forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const config = getForgeConfig();

  if (!config) {
    return `/manus-storage/${key}`;
  }

  const getUrl = new URL("v1/storage/presign/get", config.forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${config.forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

export async function getFileBytes(relKey: string): Promise<Buffer | null> {
  const key = normalizeKey(relKey);
  const local = getLocalFile(key);
  if (local) {
    return local.data;
  }
  const config = getForgeConfig();
  if (!config) {
    return null;
  }
  try {
    const signedUrl = await storageGetSignedUrl(key);
    const resp = await fetch(signedUrl);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    console.error("[Storage] getFileBytes error:", err);
    return null;
  }
}
