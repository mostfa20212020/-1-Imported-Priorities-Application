import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes, scryptSync } from "node:crypto";
import { ENV } from "./_core/env";
import {
  fileHistory,
  FileHistory,
  IncomingFile,
  incomingFiles,
  InsertIncomingFile,
  Notification,
  notifications,
  InsertUser,
  User,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

function parseDbUrl(raw?: string): string | null {
  if (!raw) return null;
  let clean = raw.trim();
  while (clean.endsWith(")") && !clean.includes("(")) {
    clean = clean.slice(0, -1).trim();
  }
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  if (!clean) return null;

  // Detect unconfigured template strings like mysql://user:password@host:port/database
  if (
    clean.includes("user:password") ||
    clean.includes("host:port") ||
    clean.includes("@host/") ||
    clean.includes("@host:") ||
    clean === "mysql://" ||
    clean === "postgresql://"
  ) {
    return null;
  }

  try {
    const parsed = new URL(clean);
    if (!parsed.hostname || parsed.hostname === "host") return null;
    if (parsed.port && !/^\d+$/.test(parsed.port)) return null;
    return clean;
  } catch {
    return null;
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    const validUrl = parseDbUrl(process.env.DATABASE_URL);
    if (validUrl) {
      try {
        _db = drizzle(validUrl);
      } catch (error) {
        console.info("[Database] Falling back to in-memory store:", (error as any)?.message || error);
        _db = null;
      }
    } else {
      _db = null;
    }
  }
  return _db;
}

// ---------------------------------------------------------------------------
// In-Memory Fallback Store (for zero-config local run / AI Studio preview)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const defaultPasswordHash = hashPassword("12345678");

let inMemoryUserIdCounter = 4;
const inMemoryUsers: User[] = [
  {
    id: 1,
    openId: "director-default-openid",
    username: "director",
    passwordHash: defaultPasswordHash,
    name: "فضيلة القاضي / رئيس النيابة العامة",
    email: "director@prosecution.gov.ye",
    loginMethod: "local",
    role: "director",
    createdAt: new Date("2026-01-01T08:00:00Z"),
    updatedAt: new Date("2026-01-01T08:00:00Z"),
    lastSignedIn: new Date(),
  },
  {
    id: 2,
    openId: "reception-default-openid",
    username: "reception",
    passwordHash: defaultPasswordHash,
    name: "موظف الاستقبال والتسجيل",
    email: "reception@prosecution.gov.ye",
    loginMethod: "local",
    role: "input",
    createdAt: new Date("2026-01-01T08:00:00Z"),
    updatedAt: new Date("2026-01-01T08:00:00Z"),
    lastSignedIn: new Date(),
  },
  {
    id: 3,
    openId: "admin-default-openid",
    username: "admin",
    passwordHash: defaultPasswordHash,
    name: "مدير النظام العام",
    email: "admin@prosecution.gov.ye",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date("2026-01-01T08:00:00Z"),
    updatedAt: new Date("2026-01-01T08:00:00Z"),
    lastSignedIn: new Date(),
  },
];

let inMemoryFileIdCounter = 5;
const inMemoryFiles: IncomingFile[] = [
  {
    id: 1,
    fileNumber: "2026/101",
    year: 2026,
    arrivalDate: new Date("2026-03-10T09:00:00Z"),
    sourceEntity: "وزارة العدل - قطاع المحاكم والتنفيذ",
    fileType: "وارد عام",
    subject: "تقرير القضايا الجنائية المستعجلة لشهر فبراير 2026 للتوجيه بشأنها",
    importance: "urgent",
    status: "awaiting_direction",
    originalFileKey: null,
    originalFileUrl: null,
    originalFileName: "تقرير_القضايا_المستعجلة_فبراير_2026.pdf",
    originalMimeType: "application/pdf",
    signedFileKey: null,
    signedFileUrl: null,
    isSigned: false,
    signatureName: null,
    signatureTitle: null,
    signedAt: null,
    signedInstruction: null,
    assignedDepartment: "الشعبة الجزائية الأولى",
    assignedEmployee: null,
    directorInstruction: null,
    notes: "يتطلب توجيه عاجل نظراً لانتهاء المهلة القضائية المحددة",
    dueDate: new Date("2026-03-20T12:00:00Z"),
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "بانتظار توجيه رئيس النيابة",
    createdAt: new Date("2026-03-10T09:15:00Z"),
    updatedAt: new Date("2026-03-10T09:15:00Z"),
    directedAt: null,
    completedAt: null,
  },
  {
    id: 2,
    fileNumber: "2026/102",
    year: 2026,
    arrivalDate: new Date("2026-03-11T10:30:00Z"),
    sourceEntity: "محكمة استئناف الأمانة",
    fileType: "وارد مكاتبات",
    subject: "طلب إفادة حول ملف الطعن رقم 454 وموقف النيابة العامة بالدعوى",
    importance: "important",
    status: "in_progress",
    originalFileKey: null,
    originalFileUrl: null,
    originalFileName: "مذكرة_استئناف_454.pdf",
    originalMimeType: "application/pdf",
    signedFileKey: null,
    signedFileUrl: null,
    isSigned: false,
    signatureName: null,
    signatureTitle: null,
    signedAt: null,
    signedInstruction: null,
    assignedDepartment: "إدارة الشؤون القانونية",
    assignedEmployee: "عضو النيابة - د. أحمد سيف",
    directorInstruction: "يُحال لعضو النيابة المختص لإعداد المذكرة القانونية خلال 48 ساعة",
    notes: "تمت إحالة الملف للدراسة",
    dueDate: new Date("2026-03-18T14:00:00Z"),
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "عضو النيابة - د. أحمد سيف",
    createdAt: new Date("2026-03-11T10:35:00Z"),
    updatedAt: new Date("2026-03-11T12:00:00Z"),
    directedAt: new Date("2026-03-11T12:00:00Z"),
    completedAt: null,
  },
  {
    id: 3,
    fileNumber: "2026/103",
    year: 2026,
    arrivalDate: new Date("2026-03-12T11:00:00Z"),
    sourceEntity: "مكتب النائب العام",
    fileType: "وارد رئاسي",
    subject: "تعميم قضائي رقم 12 بشأن تنظيم وتحديث سجلات الحبس الاحتياطي والتفتيش الدوري",
    importance: "urgent",
    status: "directed",
    originalFileKey: null,
    originalFileUrl: null,
    originalFileName: "تعميم_النائب_العام_12.pdf",
    originalMimeType: "application/pdf",
    signedFileKey: null,
    signedFileUrl: null,
    isSigned: true,
    signatureName: "فضيلة القاضي رئيس النيابة",
    signatureTitle: "رئيس النيابة العامة",
    signedAt: new Date("2026-03-12T14:30:00Z"),
    signedInstruction: "للتنفيذ الفوري وإبلاغ جميع وكلاء النيابات بالتعليمات الواردة وإفادتنا بالتقارير",
    assignedDepartment: "شعبة السجون والحبس الاحتياطي",
    assignedEmployee: "وكيل النيابة المناوب",
    directorInstruction: "للتنفيذ الفوري وتعميمه على كافة فروع النيابة في الدائرة",
    notes: "موقع إلكترونياً وموجه",
    dueDate: new Date("2026-03-16T12:00:00Z"),
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "وكيل النيابة المناوب",
    createdAt: new Date("2026-03-12T11:05:00Z"),
    updatedAt: new Date("2026-03-12T14:30:00Z"),
    directedAt: new Date("2026-03-12T14:30:00Z"),
    completedAt: null,
  },
  {
    id: 4,
    fileNumber: "2026/104",
    year: 2026,
    arrivalDate: new Date("2026-03-08T08:30:00Z"),
    sourceEntity: "إدارة التفتيش القضائي",
    fileType: "وارد مكاتبات",
    subject: "محضر إنهاء التفتيش الدوري على نيابة شرق الأمانة وتوصيات المعالجة",
    importance: "normal",
    status: "completed",
    originalFileKey: null,
    originalFileUrl: null,
    originalFileName: "محضر_التفتيش_الدوري.pdf",
    originalMimeType: "application/pdf",
    signedFileKey: null,
    signedFileUrl: null,
    isSigned: true,
    signatureName: "فضيلة القاضي رئيس النيابة",
    signatureTitle: "رئيس النيابة العامة",
    signedAt: new Date("2026-03-09T10:00:00Z"),
    signedInstruction: "تم الاطلاع والاعتماد وحفظ المحضر بالملف العام بعد استيفاء الملاحظات",
    assignedDepartment: "المكتب الفني",
    assignedEmployee: "مدير المكتب الفني",
    directorInstruction: "يُحفظ في السجل العام بعد تصويب الملاحظات الواردة",
    notes: "تم إنجاز التوجيهات وحفظ المعاملة",
    dueDate: null,
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "المحفوظات العامة",
    createdAt: new Date("2026-03-08T08:45:00Z"),
    updatedAt: new Date("2026-03-13T15:00:00Z"),
    directedAt: new Date("2026-03-09T10:00:00Z"),
    completedAt: new Date("2026-03-13T15:00:00Z"),
  },
];

let inMemoryHistoryIdCounter = 6;
const inMemoryHistory: FileHistory[] = [
  {
    id: 1,
    fileId: 1,
    actorName: "موظف الاستقبال والتسجيل",
    actionType: "تسجيل وارد جديد",
    oldStatus: null,
    newStatus: "awaiting_direction",
    details: "تم إدخال الملف الوارد وحفظه بالنظام وإحالته لصندوق توجيه رئيس النيابة",
    createdAt: new Date("2026-03-10T09:15:00Z"),
  },
  {
    id: 2,
    fileId: 2,
    actorName: "موظف الاستقبال والتسجيل",
    actionType: "تسجيل وارد جديد",
    oldStatus: null,
    newStatus: "awaiting_direction",
    details: "تم تسجيل الوارد من محكمة استئناف الأمانة",
    createdAt: new Date("2026-03-11T10:35:00Z"),
  },
  {
    id: 3,
    fileId: 2,
    actorName: "فضيلة القاضي رئيس النيابة",
    actionType: "إصدار توجيه",
    oldStatus: "awaiting_direction",
    newStatus: "in_progress",
    details: "إحالة لعضو النيابة - د. أحمد سيف لإعداد المذكرة القانونية",
    createdAt: new Date("2026-03-11T12:00:00Z"),
  },
  {
    id: 4,
    fileId: 3,
    actorName: "فضيلة القاضي رئيس النيابة",
    actionType: "توقيع إلكتروني وتوجيه",
    oldStatus: "awaiting_direction",
    newStatus: "directed",
    details: "تم توقيع الوارد إلكترونياً وتوجيهه للتنفيذ الفوري",
    createdAt: new Date("2026-03-12T14:30:00Z"),
  },
  {
    id: 5,
    fileId: 4,
    actorName: "مدير المكتب الفني",
    actionType: "اكتمال المعاملة",
    oldStatus: "in_progress",
    newStatus: "completed",
    details: "تم استيفاء جميع التوجيهات وحفظ المعاملة إلكترونياً",
    createdAt: new Date("2026-03-13T15:00:00Z"),
  },
];

let inMemoryNotificationIdCounter = 3;
const inMemoryNotifications: Notification[] = [
  {
    id: 1,
    recipientOpenId: "director-default-openid",
    recipientRole: "director",
    fileId: 1,
    kind: "file_registered",
    priority: "urgent",
    title: "ملف عاجل بانتظار توجيهكم",
    body: "ورد ملف عاجل برقم 2026/101 من وزارة العدل بشأن تقرير القضايا الجنائية المستعجلة",
    readAt: null,
    createdAt: new Date("2026-03-10T09:16:00Z"),
  },
  {
    id: 2,
    recipientOpenId: "director-default-openid",
    recipientRole: "director",
    fileId: 3,
    kind: "file_registered",
    priority: "urgent",
    title: "تعميم وارد من مكتب النائب العام",
    body: "ورد تعميم رقم 12 بشأن سجلات الحبس الاحتياطي",
    readAt: new Date("2026-03-12T11:10:00Z"),
    createdAt: new Date("2026-03-12T11:06:00Z"),
  },
];

// ---------------------------------------------------------------------------
// Database & Mock Operations
// ---------------------------------------------------------------------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  try {
    const db = await getDb();
    if (db) {
      const values: InsertUser = { openId: user.openId };
      const updateSet: Record<string, unknown> = {};
      const textFields = ["name", "email", "loginMethod"] as const;
      for (const field of textFields) {
        if (user[field] !== undefined) {
          values[field] = user[field] ?? null;
          updateSet[field] = user[field] ?? null;
        }
      }
      if (user.lastSignedIn !== undefined) {
        values.lastSignedIn = user.lastSignedIn;
        updateSet.lastSignedIn = user.lastSignedIn;
      } else {
        values.lastSignedIn = new Date();
        updateSet.lastSignedIn = new Date();
      }
      if (user.role !== undefined) {
        values.role = user.role;
        updateSet.role = user.role;
      } else if (user.openId === ENV.ownerOpenId) {
        values.role = "admin";
        updateSet.role = "admin";
      }
      await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
      return;
    }
  } catch (err) {
    console.warn("[Database] upsertUser fallback to memory:", err);
  }

  const existing = inMemoryUsers.find((u) => u.openId === user.openId);
  if (existing) {
    if (user.name !== undefined) existing.name = user.name;
    if (user.email !== undefined) existing.email = user.email;
    if (user.role !== undefined) existing.role = user.role;
    existing.lastSignedIn = user.lastSignedIn ?? new Date();
    existing.updatedAt = new Date();
  } else {
    inMemoryUsers.push({
      id: inMemoryUserIdCounter++,
      openId: user.openId,
      username: user.username ?? `user_${Date.now()}`,
      passwordHash: user.passwordHash ?? null,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? "local",
      role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: user.lastSignedIn ?? new Date(),
    });
  }
}

export async function getUserByOpenId(openId: string) {
  try {
    const db = await getDb();
    if (db) {
      const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] getUserByOpenId fallback to memory:", err);
  }
  return inMemoryUsers.find((u) => u.openId === openId);
}

export async function getUserByUsername(username: string) {
  const norm = username.trim().toLowerCase();
  try {
    const db = await getDb();
    if (db) {
      const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] getUserByUsername fallback to memory:", err);
  }
  return inMemoryUsers.find((u) => u.username?.toLowerCase() === norm);
}

export async function listUsers() {
  try {
    const db = await getDb();
    if (db) {
      return await db
        .select({
          id: users.id,
          openId: users.openId,
          username: users.username,
          name: users.name,
          email: users.email,
          loginMethod: users.loginMethod,
          role: users.role,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
    }
  } catch (err) {
    console.warn("[Database] listUsers fallback to memory:", err);
  }
  return [...inMemoryUsers]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ id, openId, username, name, email, loginMethod, role, createdAt, lastSignedIn }) => ({
      id,
      openId,
      username,
      name,
      email,
      loginMethod,
      role,
      createdAt,
      lastSignedIn,
    }));
}

export async function createLocalUser(values: InsertUser) {
  try {
    const db = await getDb();
    if (db) {
      await db.insert(users).values(values);
      return getUserByUsername(values.username || "");
    }
  } catch (err) {
    console.warn("[Database] createLocalUser fallback to memory:", err);
  }
  const newUser: User = {
    id: inMemoryUserIdCounter++,
    openId: values.openId || `user_${Date.now()}`,
    username: values.username || null,
    passwordHash: values.passwordHash || null,
    name: values.name || null,
    email: values.email || null,
    loginMethod: values.loginMethod || "local",
    role: values.role || "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  inMemoryUsers.push(newUser);
  return newUser;
}

export async function updateLocalUser(id: number, values: Partial<InsertUser>) {
  try {
    const db = await getDb();
    if (db) {
      await db.update(users).set({ ...values, updatedAt: new Date() }).where(eq(users.id, id));
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] updateLocalUser fallback to memory:", err);
  }
  const target = inMemoryUsers.find((u) => u.id === id);
  if (!target) return undefined;
  if (values.name !== undefined) target.name = values.name;
  if (values.username !== undefined) target.username = values.username;
  if (values.role !== undefined) target.role = values.role;
  if (values.passwordHash !== undefined) target.passwordHash = values.passwordHash;
  target.updatedAt = new Date();
  return target;
}

export async function listIncomingFiles(filters: {
  search?: string;
  status?: string;
  importance?: string;
  fileType?: string;
  sourceEntity?: string;
}) {
  try {
    const db = await getDb();
    if (db) {
      const conditions = [];
      if (filters.status) conditions.push(eq(incomingFiles.status, filters.status as IncomingFile["status"]));
      if (filters.importance) conditions.push(eq(incomingFiles.importance, filters.importance as IncomingFile["importance"]));
      if (filters.fileType) conditions.push(eq(incomingFiles.fileType, filters.fileType));
      if (filters.sourceEntity) conditions.push(like(incomingFiles.sourceEntity, `%${filters.sourceEntity}%`));
      if (filters.search) {
        const query = `%${filters.search}%`;
        conditions.push(
          or(
            like(incomingFiles.fileNumber, query),
            like(incomingFiles.subject, query),
            like(incomingFiles.sourceEntity, query),
            like(incomingFiles.assignedDepartment, query),
            like(incomingFiles.assignedEmployee, query),
          ),
        );
      }
      return await db
        .select()
        .from(incomingFiles)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(incomingFiles.updatedAt))
        .limit(200);
    }
  } catch (err) {
    console.warn("[Database] listIncomingFiles fallback to memory:", err);
  }

  let result = [...inMemoryFiles];
  if (filters.status) {
    result = result.filter((f) => f.status === filters.status);
  }
  if (filters.importance) {
    result = result.filter((f) => f.importance === filters.importance);
  }
  if (filters.fileType) {
    result = result.filter((f) => f.fileType === filters.fileType);
  }
  if (filters.sourceEntity) {
    const q = filters.sourceEntity.toLowerCase();
    result = result.filter((f) => f.sourceEntity.toLowerCase().includes(q));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (f) =>
        f.fileNumber.toLowerCase().includes(q) ||
        f.subject.toLowerCase().includes(q) ||
        f.sourceEntity.toLowerCase().includes(q) ||
        (f.assignedDepartment && f.assignedDepartment.toLowerCase().includes(q)) ||
        (f.assignedEmployee && f.assignedEmployee.toLowerCase().includes(q)),
    );
  }
  return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getIncomingFile(id: number) {
  try {
    const db = await getDb();
    if (db) {
      const result = await db.select().from(incomingFiles).where(eq(incomingFiles.id, id)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] getIncomingFile fallback to memory:", err);
  }
  return inMemoryFiles.find((f) => f.id === id);
}

export async function getFileHistory(fileId: number) {
  try {
    const db = await getDb();
    if (db) {
      return await db.select().from(fileHistory).where(eq(fileHistory.fileId, fileId)).orderBy(desc(fileHistory.createdAt));
    }
  } catch (err) {
    console.warn("[Database] getFileHistory fallback to memory:", err);
  }
  return inMemoryHistory
    .filter((h) => h.fileId === fileId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getFileStats() {
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select({ status: incomingFiles.status, importance: incomingFiles.importance, fileType: incomingFiles.fileType })
        .from(incomingFiles);

      const result = rows.reduce(
        (stats, row) => {
          stats.total += 1;
          if (row.status === "new") stats.newFiles += 1;
          if (row.status === "awaiting_direction") stats.awaiting += 1;
          if (row.status === "in_progress" || row.status === "directed") stats.inProgress += 1;
          if (row.status === "completed") stats.completed += 1;
          if (row.importance === "urgent") stats.urgent += 1;
          stats.byType[row.fileType] = (stats.byType[row.fileType] || 0) + 1;
          return stats;
        },
        { total: 0, newFiles: 0, awaiting: 0, inProgress: 0, completed: 0, urgent: 0, byType: {} as Record<string, number> },
      );

      return {
        ...result,
        dbEngine: "MySQL / Drizzle ORM",
        isConnectedToExternalDb: true,
        source: "قاعدة بيانات علائقية متصلة (MySQL)",
        lastSyncedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn("[Database] getFileStats fallback to memory:", err);
  }

  const stats = {
    total: inMemoryFiles.length,
    newFiles: 0,
    awaiting: 0,
    inProgress: 0,
    completed: 0,
    urgent: 0,
    byType: {} as Record<string, number>,
    dbEngine: "Drizzle Schema / In-Memory SQL Store",
    isConnectedToExternalDb: Boolean(process.env.DATABASE_URL && parseDbUrl(process.env.DATABASE_URL)),
    source: process.env.DATABASE_URL ? "قاعدة بيانات SQL مخصصة" : "قاعدة بيانات النظام (الذاكرة النشطة المتطابقة مع الـ Schema)",
    lastSyncedAt: new Date().toISOString(),
  };
  for (const f of inMemoryFiles) {
    if (f.status === "new") stats.newFiles += 1;
    if (f.status === "awaiting_direction") stats.awaiting += 1;
    if (f.status === "in_progress" || f.status === "directed") stats.inProgress += 1;
    if (f.status === "completed") stats.completed += 1;
    if (f.importance === "urgent") stats.urgent += 1;
    stats.byType[f.fileType] = (stats.byType[f.fileType] || 0) + 1;
  }
  return stats;
}

export async function createIncomingFile(values: InsertIncomingFile) {
  try {
    const db = await getDb();
    if (db) {
      const result = await db.insert(incomingFiles).values(values);
      const insertId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
      if (Number.isFinite(insertId) && insertId > 0) return await getIncomingFile(insertId);
      const fallback = await db
        .select()
        .from(incomingFiles)
        .where(eq(incomingFiles.fileNumber, values.fileNumber))
        .orderBy(desc(incomingFiles.id))
        .limit(1);
      if (fallback[0]) return fallback[0];
    }
  } catch (err) {
    console.warn("[Database] createIncomingFile fallback to memory:", err);
  }

  const newFile: IncomingFile = {
    id: inMemoryFileIdCounter++,
    fileNumber: values.fileNumber,
    year: values.year,
    arrivalDate: values.arrivalDate,
    sourceEntity: values.sourceEntity,
    fileType: values.fileType,
    subject: values.subject,
    importance: values.importance ?? "normal",
    status: values.status ?? "new",
    originalFileKey: values.originalFileKey ?? null,
    originalFileUrl: values.originalFileUrl ?? null,
    originalFileName: values.originalFileName ?? null,
    originalMimeType: values.originalMimeType ?? null,
    signedFileKey: values.signedFileKey ?? null,
    signedFileUrl: values.signedFileUrl ?? null,
    isSigned: values.isSigned ?? false,
    signatureName: values.signatureName ?? null,
    signatureTitle: values.signatureTitle ?? null,
    signedAt: values.signedAt ?? null,
    signedInstruction: values.signedInstruction ?? null,
    assignedDepartment: values.assignedDepartment ?? null,
    assignedEmployee: values.assignedEmployee ?? null,
    directorInstruction: values.directorInstruction ?? null,
    notes: values.notes ?? null,
    dueDate: values.dueDate ?? null,
    registeredBy: values.registeredBy ?? null,
    currentResponsible: values.currentResponsible ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    directedAt: values.directedAt ?? null,
    completedAt: values.completedAt ?? null,
  };
  inMemoryFiles.unshift(newFile);
  return newFile;
}

export async function updateIncomingFile(id: number, values: Partial<InsertIncomingFile>) {
  try {
    const db = await getDb();
    if (db) {
      await db.update(incomingFiles).set({ ...values, updatedAt: new Date() }).where(eq(incomingFiles.id, id));
      const row = await getIncomingFile(id);
      if (row) return row;
    }
  } catch (err) {
    console.warn("[Database] updateIncomingFile fallback to memory:", err);
  }

  const target = inMemoryFiles.find((f) => f.id === id);
  if (!target) return undefined;
  Object.assign(target, values, { updatedAt: new Date() });
  return target;
}

export async function deleteIncomingFile(id: number) {
  try {
    const db = await getDb();
    if (db) {
      await db.delete(fileHistory).where(eq(fileHistory.fileId, id));
      await db.delete(notifications).where(eq(notifications.fileId, id));
      await db.delete(incomingFiles).where(eq(incomingFiles.id, id));
      return true;
    }
  } catch (err) {
    console.warn("[Database] deleteIncomingFile fallback to memory:", err);
  }

  const idx = inMemoryFiles.findIndex((f) => f.id === id);
  if (idx !== -1) {
    inMemoryFiles.splice(idx, 1);
    for (let i = inMemoryHistory.length - 1; i >= 0; i--) {
      if (inMemoryHistory[i].fileId === id) inMemoryHistory.splice(i, 1);
    }
    for (let i = inMemoryNotifications.length - 1; i >= 0; i--) {
      if (inMemoryNotifications[i].fileId === id) inMemoryNotifications.splice(i, 1);
    }
    return true;
  }
  return false;
}

export async function addFileHistory(values: typeof fileHistory.$inferInsert) {
  try {
    const db = await getDb();
    if (db) {
      await db.insert(fileHistory).values(values);
      return;
    }
  } catch (err) {
    console.warn("[Database] addFileHistory fallback to memory:", err);
  }

  const newHistory: FileHistory = {
    id: inMemoryHistoryIdCounter++,
    fileId: values.fileId,
    actorName: values.actorName,
    actionType: values.actionType,
    oldStatus: values.oldStatus ?? null,
    newStatus: values.newStatus ?? null,
    details: values.details ?? null,
    createdAt: new Date(),
  };
  inMemoryHistory.unshift(newHistory);
}

export async function createNotification(values: typeof notifications.$inferInsert) {
  try {
    const db = await getDb();
    if (db) {
      await db.insert(notifications).values(values);
      return;
    }
  } catch (err) {
    console.warn("[Database] createNotification fallback to memory:", err);
  }

  const newNotif: Notification = {
    id: inMemoryNotificationIdCounter++,
    recipientOpenId: values.recipientOpenId ?? null,
    recipientRole: values.recipientRole ?? "director",
    fileId: values.fileId ?? null,
    kind: values.kind,
    priority: values.priority ?? "normal",
    title: values.title,
    body: values.body,
    readAt: null,
    createdAt: new Date(),
  };
  inMemoryNotifications.unshift(newNotif);
}

export async function listNotifications(recipientOpenId: string) {
  try {
    const db = await getDb();
    if (db) {
      return await db
        .select()
        .from(notifications)
        .where(or(eq(notifications.recipientOpenId, recipientOpenId), eq(notifications.recipientRole, "director")))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
    }
  } catch (err) {
    console.warn("[Database] listNotifications fallback to memory:", err);
  }

  return inMemoryNotifications
    .filter((n) => !n.recipientOpenId || n.recipientOpenId === recipientOpenId || n.recipientRole === "director")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function markNotificationRead(id: number) {
  try {
    const db = await getDb();
    if (db) {
      await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
      return;
    }
  } catch (err) {
    console.warn("[Database] markNotificationRead fallback to memory:", err);
  }

  const notif = inMemoryNotifications.find((n) => n.id === id);
  if (notif) notif.readAt = new Date();
}
