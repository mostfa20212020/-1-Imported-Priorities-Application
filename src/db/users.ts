import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

const defaultUsers = [
  {
    id: 1,
    uid: 'director-default-uid',
    openId: 'director-default-openid',
    username: 'director',
    name: 'فضيلة القاضي / رئيس النيابة العامة',
    jobTitle: 'رئيس النيابة العامة',
    email: 'director@prosecution.gov.ye',
    loginMethod: 'local',
    role: 'director',
    createdAt: new Date('2026-01-01T08:00:00Z'),
    updatedAt: new Date('2026-01-01T08:00:00Z'),
    lastSignedIn: new Date(),
  },
  {
    id: 2,
    uid: 'reception-default-uid',
    openId: 'reception-default-openid',
    username: 'reception',
    name: 'موظف الاستقبال والتسجيل',
    jobTitle: 'موظف الاستقبال والتسجيل',
    email: 'reception@prosecution.gov.ye',
    loginMethod: 'local',
    role: 'input',
    createdAt: new Date('2026-01-01T08:00:00Z'),
    updatedAt: new Date('2026-01-01T08:00:00Z'),
    lastSignedIn: new Date(),
  },
  {
    id: 3,
    uid: 'admin-default-uid',
    openId: 'admin-default-openid',
    username: 'admin',
    name: 'مدير النظام العام',
    jobTitle: 'مدير النظام ومسؤول الشبكة',
    email: 'admin@prosecution.gov.ye',
    loginMethod: 'local',
    role: 'admin',
    createdAt: new Date('2026-01-01T08:00:00Z'),
    updatedAt: new Date('2026-01-01T08:00:00Z'),
    lastSignedIn: new Date(),
  },
];

export async function getOrCreateUser(uid: string, email: string) {
  try {
    await db
      .insert(users)
      .values({
        uid,
        email,
        openId: uid,
      })
      .onDuplicateKeyUpdate({
        set: {
          email,
        },
      });

    const [user] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (user) return user;
  } catch (error) {
    // Graceful fallback to default/memory user
  }

  const existing = defaultUsers.find((u) => u.uid === uid || u.email === email);
  if (existing) return existing as any;

  const newUser = {
    id: defaultUsers.length + 1,
    uid,
    openId: uid,
    username: email.split('@')[0] || uid,
    name: email.split('@')[0] || 'مستخدم',
    jobTitle: 'عضو نيابة',
    email,
    loginMethod: 'oauth',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  defaultUsers.push(newUser);
  return newUser as any;
}

export async function getUsers() {
  try {
    const list = await db.select().from(users);
    if (list && list.length > 0) return list;
  } catch (error) {
    // Fallback when MySQL is offline
  }
  return defaultUsers as any[];
}
