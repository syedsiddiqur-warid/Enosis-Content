import "server-only";
import { createDb, type Db } from "./client";

const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

/** Shared database handle. Cached on globalThis so dev hot-reloads don't reopen it. */
export function getDb(): Promise<Db> {
  globalForDb.__db ??= createDb({ migrate: true });
  return globalForDb.__db;
}
