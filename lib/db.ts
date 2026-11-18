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
        wrong INT NOT NULL DEFAULT 0
      )
    `
      .then(() => sql`ALTER TABLE words DROP COLUMN IF EXISTS forms`)
      // Examples/expressions are stored as words that point at their parent word.
      .then(() => sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS parent_id TEXT`);
  }
  return tableReady;
}

let streakTableReady: Promise<unknown> | null = null;

// One row per calendar day (client's local date), tracking active quiz seconds.
export function ensureStreakTable() {
  if (!streakTableReady) {
    streakTableReady = sql`
      CREATE TABLE IF NOT EXISTS streak_days (
        day TEXT PRIMARY KEY,
        seconds INT NOT NULL DEFAULT 0
      )
    `;
  }
  return streakTableReady;
}
