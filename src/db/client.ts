import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL set  -> real Postgres (Supabase, Neon, local Postgres).
 * DATABASE_URL empty -> embedded PGlite stored in PGLITE_DIR, for local dev without installing Postgres.
 * Note: PGlite allows one process at a time, so stop `npm run dev` before running db scripts.
 */
export async function createDb({ migrate }: { migrate: boolean }): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: 10, prepare: false });
    const db = drizzlePostgres(client, { schema });
    if (migrate) await migratePostgres(db, { migrationsFolder });
    return db as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(process.cwd(), process.env.PGLITE_DIR || ".data/pglite");
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  if (migrate) await migratePglite(db, { migrationsFolder });
  return db;
}
