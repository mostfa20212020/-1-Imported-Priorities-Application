import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

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
    return user;
  } catch (error) {
    console.error("Failed to get or create user:", error);
    throw new Error("Database query failed. Please try again later.", { cause: error });
  }
}

export async function getUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error("Database query failed:", error);
    throw new Error("Database query failed. Please try again later.", { cause: error });
  }
}
