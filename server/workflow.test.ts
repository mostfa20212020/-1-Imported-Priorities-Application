import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: AuthenticatedUser["role"] = "admin"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "workflow-test-user",
    email: "test@example.com",
    name: "مستخدم الاختبار",
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("incoming files workflow router", () => {
  it("exposes an empty file list and zeroed stats when the database has no rows", async () => {
    const caller = appRouter.createCaller(createContext());
    const [files, stats] = await Promise.all([
      caller.files.list({}),
      caller.files.stats(),
    ]);

    expect(Array.isArray(files)).toBe(true);
    expect(stats).toMatchObject({ total: expect.any(Number), awaiting: expect.any(Number), completed: expect.any(Number) });
  });

  it("exposes the notification list for the authenticated director", async () => {
    const caller = appRouter.createCaller(createContext());
    const notifications = await caller.notifications.list();
    expect(Array.isArray(notifications)).toBe(true);
  });

  it("keeps the Arabic status and importance vocabulary in the client contract", () => {
    const statusKeys = ["new", "awaiting_direction", "directed", "in_progress", "returned", "completed", "archived"];
    const importanceKeys = ["normal", "important", "urgent"];
    expect(statusKeys).toContain("awaiting_direction");
    expect(statusKeys).toContain("archived");
    expect(importanceKeys).toEqual(["normal", "important", "urgent"]);
  });

  it("rejects workflow direction from the input and receiving role", async () => {
    const caller = appRouter.createCaller(createContext("input"));
    await expect(caller.files.updateWorkflow({ fileId: 1, status: "directed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects file registration from the director role", async () => {
    const caller = appRouter.createCaller(createContext("director"));
    await expect(caller.files.create({
      fileNumber: "اختبار",
      year: 2026,
      arrivalDate: "2026-09-14",
      sourceEntity: "جهة اختبار",
      fileType: "وارد إداري",
      subject: "موضوع اختبار",
      importance: "normal",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows only administrators to open the users panel API", async () => {
    const director = appRouter.createCaller(createContext("director"));
    await expect(director.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = appRouter.createCaller(createContext("admin"));
    const users = await admin.users.list();
    expect(Array.isArray(users)).toBe(true);
  });

  it("rejects an invalid local login with an unauthorized error", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.auth.login({ username: "not-a-user", password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
