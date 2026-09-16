import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateLocalRequest } from "./localAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Local username/password sessions are the only application login path.
  // This prevents a previously cached OAuth session from bypassing role separation.
  user = await authenticateLocalRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
