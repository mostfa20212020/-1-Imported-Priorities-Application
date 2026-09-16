import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";

export const LOCAL_SESSION_COOKIE = "alawliyat_session";

const FALLBACK_SECRET = "local-development-secret-minimum-32-chars-key!";

function getSigningSecret(): Uint8Array {
  const custom = process.env.JWT_SECRET?.trim() || ENV.cookieSecret?.trim();
  // Ensure we use a valid secret with adequate length
  const key = custom && custom.length >= 16 ? custom : FALLBACK_SECRET;
  return new TextEncoder().encode(key);
}

function getVerificationSecretCandidates(): Uint8Array[] {
  const secrets = new Set<string>();
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    secrets.add(process.env.JWT_SECRET.trim());
  }
  if (ENV.cookieSecret && ENV.cookieSecret.trim()) {
    secrets.add(ENV.cookieSecret.trim());
  }
  secrets.add(FALLBACK_SECRET);
  return Array.from(secrets).map((s) => new TextEncoder().encode(s));
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export async function createLocalSession(user: User, res: Response, req: Request): Promise<string> {
  const token = await new SignJWT({ userId: user.id, openId: user.openId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSigningSecret());
  res.cookie(LOCAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(req), maxAge: 12 * 60 * 60 * 1000 });
  return token;
}

export function clearLocalSession(res: Response, req: Request) {
  res.clearCookie(LOCAL_SESSION_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });
}

export async function authenticateLocalRequest(req: Request) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const queryToken = typeof req.query?.token === "string" ? req.query.token : undefined;
  const token = bearerToken || queryToken || readCookie(req, LOCAL_SESSION_COOKIE);
  if (!token) return null;

  for (const secret of getVerificationSecretCandidates()) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.openId) {
        const user = await getUserByOpenId(String(payload.openId));
        if (user) return user;
      }
    } catch {
      // Continue to next candidate secret
    }
  }
  return null;
}
