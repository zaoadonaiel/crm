import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzleNeon<typeof schema>>;

let _db: DB | undefined;

function isLocal(url: string) {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Local dev (PGlite / local Postgres) uses a TCP pool via `pg`. The branch is
  // compiled out of production builds, so `pg` never ships to Cloudflare —
  // production always talks to Neon over its HTTP driver.
  if (process.env.NODE_ENV !== "production" && isLocal(url)) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const { Pool } = require("pg") as typeof import("pg");
    /* eslint-enable @typescript-eslint/no-require-imports */
    return drizzle(new Pool({ connectionString: url, max: 1 }), { schema }) as unknown as DB;
  }
  return drizzleNeon(neon(url), { schema });
}

/** Lazily-created Drizzle client. */
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    _db ??= create();
    const value = Reflect.get(_db, prop);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});

export * as tables from "./schema";
