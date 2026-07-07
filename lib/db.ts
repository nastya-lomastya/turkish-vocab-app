import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local or Vercel project env vars.");
}

export const sql = neon(process.env.DATABASE_URL);

let tableReady: Promise<unknown> | null = null;

// Called at the top of every API route that touches the words table.
// Cheap no-op after the first successful call within a warm function instance.
export function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS words (
        id TEXT PRIMARY KEY,
        tr TEXT NOT NULL,
        ru TEXT NOT NULL,
        added BIGINT NOT NULL,
        correct INT NOT NULL DEFAULT 0,
        wrong INT NOT NULL DEFAULT 0,
        forms JSONB NOT NULL DEFAULT '[]'
      )
    `;
  }
  return tableReady;
}
