import { and, desc, eq, ilike, or } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { QueryResult, QueryResultRow } from "pg";
import { ENV } from "./_core/env";
import { db, pool } from "../src/db/index.ts";
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
} from "../src/db/schema.ts";

// Re-export initialized Drizzle ORM and pg.Pool instance
export { db, pool };

/**
 * Direct query handler using 'pg' pool for raw SQL execution
 * Initializes and executes parameterized SQL queries directly on PostgreSQL
 * using credentials from .env (SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, DATABASE_URL)
 *
 * @param text The SQL query string (e.g. 'SELECT * FROM users WHERE id = $1')
 * @param params Optional parameterized values to prevent SQL injection
 */
export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  const start = Date.now();
  try {
    const res = await pool.query<R>(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== "production") {
      console.log(`[PostgreSQL] Query executed in ${duration}ms | rows: ${res.rowCount}`);
    }
    return res;
  } catch (err: any) {
    console.error(`[PostgreSQL Query Error]: "${text}"`, err);
    throw err;
  }
}

export async function getDb() {
  if (process.env.SQL_HOST || process.env.SQL_USER || process.env.DATABASE_URL) {
    return db;
  }
  return null;
}

// ---------------------------------------------------------------------------
// In-Memory Fallback Store (for zero-config local run / test / fallback)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const defaultPasswordHash = "c3b53c1ec252f58e6584288bcf33c6f2:7cbc81a044f526a2cc1c9f720dd7bb45570ed13f92faffc2ab91c19405882d3430f3cbb23ee402857e111fcfdabc522f73a6df9d40bbdb6ba14b7b8c523142d3";

let inMemoryUserIdCounter = 4;
const inMemoryUsers: User[] = [
  {
    id: 1,
    uid: null,
    openId: "director-default-openid",
    username: "director",
    passwordHash: defaultPasswordHash,
    name: "فضيلة القاضي / رئيس النيابة العامة",
    jobTitle: "رئيس النيابة العامة",
    email: "director@prosecution.gov.ye",
    loginMethod: "local",
    role: "director",
    createdAt: new Date("2026-01-01T08:00:00Z"),
    updatedAt: new Date("2026-01-01T08:00:00Z"),
    lastSignedIn: new Date(),
  },
  {
    id: 2,
    uid: null,
    openId: "reception-default-openid",
    username: "reception",
    passwordHash: defaultPasswordHash,
    name: "موظف الاستقبال والتسجيل",
    jobTitle: "موظف الاستقبال والتسجيل",
    email: "reception@prosecution.gov.ye",
    loginMethod: "local",
    role: "input",
    createdAt: new Date("2026-01-01T08:00:00Z"),
    updatedAt: new Date("2026-01-01T08:00:00Z"),
    lastSignedIn: new Date(),
  },
  {
    id: 3,
    uid: null,
    openId: "admin-default-openid",
    username: "admin",
    passwordHash: defaultPasswordHash,
    name: "مدير النظام العام",
    jobTitle: "مدير النظام العام",
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
    status: "PENDING_AG",
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
    notes: "يتطلب توجيه عاجل من فضيلة النائب العام نظراً لانتهاء المهلة القضائية المحددة",
    dueDate: new Date("2026-03-20T12:00:00Z"),
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "النائب العام للتوجيه والتوقيع (المرحلة الأولى)",
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
    status: "PENDING_EMPLOYEE",
    originalFileKey: null,
    originalFileUrl: null,
    originalFileName: "مذكرة_استئناف_454.pdf",
    originalMimeType: "application/pdf",
    signedFileKey: null,
    signedFileUrl: null,
    isSigned: true,
    signatureName: "فضيلة النائب العام",
    signatureTitle: "النائب العام للجمهورية",
    signedAt: new Date("2026-03-11T12:00:00Z"),
    signedInstruction: "يُحال لعضو النيابة المختص لإعداد المذكرة القانونية خلال 48 ساعة وموافاتنا بنسخة",
    assignedDepartment: "إدارة الشؤون القانونية",
    assignedEmployee: "عضو النيابة - د. أحمد سيف",
    directorInstruction: "يُحال لعضو النيابة المختص لإعداد المذكرة القانونية خلال 48 ساعة وموافاتنا بنسخة",
    notes: "تم توقيع وتوجيه المعاملة من قبل النائب العام وهي بانتظار تفريغ التوجيه والترحيل النهائي من الموظف",
    dueDate: new Date("2026-03-18T14:00:00Z"),
    registeredBy: "موظف الاستقبال والتسجيل",
    currentResponsible: "موظف الاستقبال والتسجيل (المرحلة الثانية: تفريغ التوجيه والترحيل النهائي)",
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
// Database Operations (PostgreSQL via Cloud SQL Drizzle ORM)
// ---------------------------------------------------------------------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  try {
    const database = await getDb();
    if (database) {
      const values: InsertUser = { openId: user.openId };
      const updateSet: Record<string, unknown> = {};
      const textFields = ["name", "email", "loginMethod", "uid"] as const;
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
      await database
        .insert(users)
        .values(values)
        .onConflictDoUpdate({
          target: users.openId,
          set: updateSet,
        });
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
    if (user.uid !== undefined) existing.uid = user.uid;
    existing.lastSignedIn = user.lastSignedIn ?? new Date();
    existing.updatedAt = new Date();
  } else {
    inMemoryUsers.push({
      id: inMemoryUserIdCounter++,
      uid: user.uid ?? null,
      openId: user.openId,
      username: user.username ?? `user_${Date.now()}`,
      passwordHash: user.passwordHash ?? null,
      name: user.name ?? null,
      jobTitle: user.jobTitle ?? null,
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
    const database = await getDb();
    if (database) {
      const result = await database.select().from(users).where(eq(users.openId, openId)).limit(1);
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
    const database = await getDb();
    if (database) {
      const result = await database.select().from(users).where(ilike(users.username, norm)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] getUserByUsername fallback to memory:", err);
  }
  return inMemoryUsers.find((u) => u.username?.toLowerCase() === norm);
}

export async function listUsers() {
  try {
    const database = await getDb();
    if (database) {
      return await database
        .select({
          id: users.id,
          uid: users.uid,
          openId: users.openId,
          username: users.username,
          name: users.name,
          jobTitle: users.jobTitle,
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
    .map(({ id, uid, openId, username, name, jobTitle, email, loginMethod, role, createdAt, lastSignedIn }) => ({
      id,
      uid,
      openId,
      username,
      name,
      jobTitle: jobTitle ?? null,
      email,
      loginMethod,
      role,
      createdAt,
      lastSignedIn,
    }));
}

export async function createLocalUser(values: InsertUser) {
  try {
    const database = await getDb();
    if (database) {
      const [created] = await database.insert(users).values(values).returning();
      if (created) return created;
    }
  } catch (err) {
    console.warn("[Database] createLocalUser fallback to memory:", err);
  }
  const newUser: User = {
    id: inMemoryUserIdCounter++,
    uid: values.uid ?? null,
    openId: values.openId || `user_${Date.now()}`,
    username: values.username || null,
    passwordHash: values.passwordHash || null,
    name: values.name || null,
    jobTitle: values.jobTitle || null,
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
    const database = await getDb();
    if (database) {
      const [updated] = await database
        .update(users)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (updated) return updated;
    }
  } catch (err) {
    console.warn("[Database] updateLocalUser fallback to memory:", err);
  }
  const target = inMemoryUsers.find((u) => u.id === id);
  if (!target) return undefined;
  if (values.name !== undefined) target.name = values.name;
  if (values.username !== undefined) target.username = values.username;
  if (values.jobTitle !== undefined) target.jobTitle = values.jobTitle;
  if (values.email !== undefined) target.email = values.email;
  if (values.role !== undefined) target.role = values.role;
  if (values.passwordHash !== undefined) target.passwordHash = values.passwordHash;
  target.updatedAt = new Date();
  return target;
}

export async function deleteLocalUser(id: number): Promise<boolean> {
  try {
    const database = await getDb();
    if (database) {
      await database.delete(users).where(eq(users.id, id));
      return true;
    }
  } catch (err) {
    console.warn("[Database] deleteLocalUser fallback to memory:", err);
  }
  const idx = inMemoryUsers.findIndex((u) => u.id === id);
  if (idx !== -1) {
    inMemoryUsers.splice(idx, 1);
    return true;
  }
  return false;
}

let inMemoryJobTitles: string[] = [
  "رئيس النيابة العامة",
  "النائب العام للجمهورية",
  "المحامي العام الأول",
  "رئيس نيابة الاستئناف",
  "وكيل نيابة أول",
  "وكيل نيابة",
  "عضو نيابة عامة",
  "مدير المكتب الفني",
  "مدير إدارة الشؤون القضائية",
  "رئيس قلم التحقيق",
  "أمين السر",
  "موظف الاستقبال والتسجيل",
  "مدير النظام العام",
];

export async function getJobTitlesList(): Promise<string[]> {
  return inMemoryJobTitles;
}

export async function addJobTitle(title: string): Promise<string[]> {
  const trimmed = title.trim();
  if (trimmed && !inMemoryJobTitles.includes(trimmed)) {
    inMemoryJobTitles.push(trimmed);
  }
  return inMemoryJobTitles;
}

export async function updateJobTitle(oldTitle: string, newTitle: string): Promise<string[]> {
  const oTrimmed = oldTitle.trim();
  const nTrimmed = newTitle.trim();
  if (!nTrimmed) return inMemoryJobTitles;

  const idx = inMemoryJobTitles.indexOf(oTrimmed);
  if (idx !== -1) {
    inMemoryJobTitles[idx] = nTrimmed;
  } else if (!inMemoryJobTitles.includes(nTrimmed)) {
    inMemoryJobTitles.push(nTrimmed);
  }

  try {
    const database = await getDb();
    if (database) {
      await database.update(users).set({ jobTitle: nTrimmed, updatedAt: new Date() }).where(eq(users.jobTitle, oTrimmed));
    }
  } catch (err) {
    console.warn("[Database] updateJobTitle users fallback to memory:", err);
  }

  for (const user of inMemoryUsers) {
    if (user.jobTitle === oTrimmed) {
      user.jobTitle = nTrimmed;
      user.updatedAt = new Date();
    }
  }

  return inMemoryJobTitles;
}

export async function deleteJobTitle(title: string): Promise<string[]> {
  const trimmed = title.trim();
  inMemoryJobTitles = inMemoryJobTitles.filter((t) => t !== trimmed);
  return inMemoryJobTitles;
}

export type RoleKey = "input" | "director" | "admin";

export interface RoleDefinition {
  key: RoleKey;
  title: string;
  description: string;
  badgeClass: string;
}

const defaultRoleDefinitions: Record<RoleKey, { title: string; description: string; badgeClass: string }> = {
  input: {
    title: "موظف الإدخال والاستقبال",
    description: "تسجيل، فحص، وتوجيه وارد، ومتابعة القيد وحالات المعاملات",
    badgeClass: "badge-role-input",
  },
  director: {
    title: "رئيس النيابة العامة",
    description: "إشراف، إصدار توجيهات وقرارات قضائية، واعتماد التوقيع الرقمي",
    badgeClass: "badge-role-director",
  },
  admin: {
    title: "مدير النظام العام",
    description: "كامل الصلاحيات والإعدادات وإدارة المستخدمين والمسميات",
    badgeClass: "badge-role-admin",
  },
};

let inMemoryRoleDefinitions: Record<RoleKey, { title: string; description: string; badgeClass: string }> = {
  input: { ...defaultRoleDefinitions.input },
  director: { ...defaultRoleDefinitions.director },
  admin: { ...defaultRoleDefinitions.admin },
};

export async function getRoleDefinitions(): Promise<Record<RoleKey, { title: string; description: string; badgeClass: string }>> {
  return inMemoryRoleDefinitions;
}

export async function updateRoleDefinition(
  key: RoleKey,
  title: string,
  description?: string
): Promise<Record<RoleKey, { title: string; description: string; badgeClass: string }>> {
  if (inMemoryRoleDefinitions[key]) {
    const trimmedTitle = title.trim();
    if (trimmedTitle) {
      inMemoryRoleDefinitions[key].title = trimmedTitle;
    }
    if (description !== undefined) {
      inMemoryRoleDefinitions[key].description = description.trim();
    }
  }
  return inMemoryRoleDefinitions;
}

export async function resetRoleDefinitions(): Promise<Record<RoleKey, { title: string; description: string; badgeClass: string }>> {
  inMemoryRoleDefinitions = {
    input: { ...defaultRoleDefinitions.input },
    director: { ...defaultRoleDefinitions.director },
    admin: { ...defaultRoleDefinitions.admin },
  };
  return inMemoryRoleDefinitions;
}

export async function listIncomingFiles(filters: {
  search?: string;
  status?: string;
  importance?: string;
  fileType?: string;
  sourceEntity?: string;
}) {
  try {
    const database = await getDb();
    if (database) {
      const conditions = [];
      if (filters.status) conditions.push(eq(incomingFiles.status, filters.status));
      if (filters.importance) conditions.push(eq(incomingFiles.importance, filters.importance));
      if (filters.fileType) conditions.push(eq(incomingFiles.fileType, filters.fileType));
      if (filters.sourceEntity) conditions.push(ilike(incomingFiles.sourceEntity, `%${filters.sourceEntity}%`));
      if (filters.search) {
        const query = `%${filters.search}%`;
        conditions.push(
          or(
            ilike(incomingFiles.fileNumber, query),
            ilike(incomingFiles.subject, query),
            ilike(incomingFiles.sourceEntity, query),
            ilike(incomingFiles.assignedDepartment, query),
            ilike(incomingFiles.assignedEmployee, query),
          ),
        );
      }
      return await database
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
    const database = await getDb();
    if (database) {
      const result = await database.select().from(incomingFiles).where(eq(incomingFiles.id, id)).limit(1);
      if (result[0]) return result[0];
    }
  } catch (err) {
    console.warn("[Database] getIncomingFile fallback to memory:", err);
  }
  return inMemoryFiles.find((f) => f.id === id);
}

export async function getFileHistory(fileId: number) {
  try {
    const database = await getDb();
    if (database) {
      return await database.select().from(fileHistory).where(eq(fileHistory.fileId, fileId)).orderBy(desc(fileHistory.createdAt));
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
    const database = await getDb();
    if (database) {
      const rows = await database
        .select({ status: incomingFiles.status, importance: incomingFiles.importance, fileType: incomingFiles.fileType })
        .from(incomingFiles);

      const result = rows.reduce(
        (stats, row) => {
          stats.total += 1;
          if (row.status === "new" || row.status === "awaiting_direction" || row.status === "PENDING_AG") stats.awaiting += 1;
          if (row.status === "PENDING_EMPLOYEE") stats.pendingEmployee += 1;
          if (row.status === "in_progress" || row.status === "directed") stats.inProgress += 1;
          if (row.status === "completed" || row.status === "COMPLETED") stats.completed += 1;
          if (row.importance === "urgent") stats.urgent += 1;
          stats.byType[row.fileType] = (stats.byType[row.fileType] || 0) + 1;
          return stats;
        },
        { total: 0, newFiles: 0, awaiting: 0, pendingEmployee: 0, inProgress: 0, completed: 0, urgent: 0, byType: {} as Record<string, number> },
      );

      return {
        ...result,
        dbEngine: "PostgreSQL (Cloud SQL) / Drizzle ORM",
        isConnectedToExternalDb: true,
        source: "قاعدة بيانات سحابية علائقية (Cloud SQL - PostgreSQL)",
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
    pendingEmployee: 0,
    inProgress: 0,
    completed: 0,
    urgent: 0,
    byType: {} as Record<string, number>,
    dbEngine: "Drizzle Schema / In-Memory SQL Store",
    isConnectedToExternalDb: false,
    source: "قاعدة بيانات النظام المدمجة",
    lastSyncedAt: new Date().toISOString(),
  };
  for (const f of inMemoryFiles) {
    if (f.status === "new" || f.status === "awaiting_direction" || f.status === "PENDING_AG") stats.awaiting += 1;
    if (f.status === "PENDING_EMPLOYEE") stats.pendingEmployee += 1;
    if (f.status === "in_progress" || f.status === "directed") stats.inProgress += 1;
    if (f.status === "completed" || f.status === "COMPLETED") stats.completed += 1;
    if (f.importance === "urgent") stats.urgent += 1;
    stats.byType[f.fileType] = (stats.byType[f.fileType] || 0) + 1;
  }
  return stats;
}

export async function getNextIncomingFileNumber(): Promise<{ nextNumber: number; formatted: string }> {
  try {
    const database = await getDb();
    if (database) {
      const rows = await database.select({ fileNumber: incomingFiles.fileNumber }).from(incomingFiles);
      let maxNum = 0;
      for (const row of rows) {
        if (!row.fileNumber) continue;
        const pure = row.fileNumber.trim();
        const num = parseInt(pure, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
      const nextNumber = maxNum > 0 ? maxNum + 1 : 1;
      return { nextNumber, formatted: String(nextNumber) };
    }
  } catch (err) {
    console.warn("[Database] getNextIncomingFileNumber fallback to memory:", err);
  }

  let maxNum = 0;
  for (const f of inMemoryFiles) {
    if (!f.fileNumber) continue;
    const pure = f.fileNumber.trim();
    const num = parseInt(pure, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  const nextNumber = maxNum > 0 ? maxNum + 1 : 1;
  return { nextNumber, formatted: String(nextNumber) };
}

export async function createIncomingFile(values: InsertIncomingFile) {
  try {
    const database = await getDb();
    if (database) {
      const [created] = await database.insert(incomingFiles).values(values).returning();
      if (created) return created;
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
    status: values.status ?? "PENDING_AG",
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
    const database = await getDb();
    if (database) {
      const [updated] = await database
        .update(incomingFiles)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(incomingFiles.id, id))
        .returning();
      if (updated) return updated;
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
    const database = await getDb();
    if (database) {
      await database.delete(fileHistory).where(eq(fileHistory.fileId, id));
      await database.delete(notifications).where(eq(notifications.fileId, id));
      await database.delete(incomingFiles).where(eq(incomingFiles.id, id));
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

export async function clearAllIncomingFiles() {
  try {
    const database = await getDb();
    if (database) {
      await database.delete(fileHistory);
      await database.delete(notifications);
      await database.delete(incomingFiles);
      return true;
    }
  } catch (err) {
    console.warn("[Database] clearAllIncomingFiles fallback to memory:", err);
  }

  inMemoryFiles.length = 0;
  inMemoryHistory.length = 0;
  inMemoryNotifications.length = 0;
  inMemoryFileIdCounter = 1;
  return true;
}

export async function addFileHistory(values: typeof fileHistory.$inferInsert) {
  try {
    const database = await getDb();
    if (database) {
      await database.insert(fileHistory).values(values);
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
    const database = await getDb();
    if (database) {
      await database.insert(notifications).values(values);
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
    const database = await getDb();
    if (database) {
      return await database
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
    const database = await getDb();
    if (database) {
      await database.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
      return;
    }
  } catch (err) {
    console.warn("[Database] markNotificationRead fallback to memory:", err);
  }

  const notif = inMemoryNotifications.find((n) => n.id === id);
  if (notif) notif.readAt = new Date();
}

// ---------------------------------------------------------------------------
// Document Annotations & Sticky Notes Storage (Coordinate Layer)
// ---------------------------------------------------------------------------

export interface DocumentAnnotationRecord {
  id: string;
  fileId: number;
  docType: "original" | "signed";
  type: "shape" | "sticky_note";
  x: number;
  y: number;
  width?: number;
  height?: number;
  shapeType?: "rectangle" | "circle" | "arrow" | "line" | "freehand";
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  points?: Array<{ x: number; y: number }>;
  title?: string;
  content?: string;
  authorName?: string;
  authorRole?: string;
  isResolved?: boolean;
  createdAt: string;
  updatedAt?: string;
}

const inMemoryAnnotations = new Map<string, DocumentAnnotationRecord[]>();

function getAnnotationsKey(fileId: number, docType: string = "original") {
  return `${fileId}_${docType}`;
}

export async function getFileAnnotations(fileId: number, docType: string = "original"): Promise<DocumentAnnotationRecord[]> {
  const key = getAnnotationsKey(fileId, docType);
  if (inMemoryAnnotations.has(key)) {
    return inMemoryAnnotations.get(key) || [];
  }
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const storagePath = path.resolve(process.cwd(), ".local_storage", `annotations_${key}.json`);
    const data = await fs.readFile(storagePath, "utf-8");
    const parsed = JSON.parse(data);
    inMemoryAnnotations.set(key, parsed);
    return parsed;
  } catch {
    return [];
  }
}

export async function saveFileAnnotations(fileId: number, docType: string = "original", annotations: DocumentAnnotationRecord[]): Promise<DocumentAnnotationRecord[]> {
  const key = getAnnotationsKey(fileId, docType);
  inMemoryAnnotations.set(key, annotations);
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), ".local_storage");
    await fs.mkdir(dir, { recursive: true });
    const storagePath = path.join(dir, `annotations_${key}.json`);
    await fs.writeFile(storagePath, JSON.stringify(annotations, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Storage] Could not persist annotations to disk:", err);
  }
  return annotations;
}
