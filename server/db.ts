import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.error("WARNING: DATABASE_URL not set. Database features will not work.");
}

const pool = process.env.DATABASE_URL 
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : null;

// Test connection on startup but don't block
if (pool) {
  pool.connect()
    .then(client => {
      console.log("[Database] Connected successfully");
      client.release();
    })
    .catch(err => {
      console.error("[Database] Connection failed:", err.message);
    });
}

export const db = pool ? drizzle(pool, { schema }) : null as any;
