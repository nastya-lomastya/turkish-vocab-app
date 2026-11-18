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
      // Examples/expressions are ordinary rows in "words" linked to one or
      // more words via example_links. A word with no links is a main-list word.
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS example_links (
            example_id TEXT NOT NULL,
            word_id TEXT NOT NULL,
            PRIMARY KEY (example_id, word_id)
          )
        `
      )
      .then(() => migrateParentId())
      .catch((e) => {
        tableReady = null; // retry on the next request instead of staying broken
        throw e;
      });
  }
  return tableReady;
}

// One-time migration from the old single-parent column (words.parent_id).
async function migrateParentId() {
  const col = await sql`
    SELECT 1 FROM information_schema.columns WHERE table_name = 'words' AND column_name = 'parent_id'
  `;
  if (col.length === 0) return;
  await sql`
    INSERT INTO example_links (example_id, word_id)
    SELECT id, parent_id FROM words WHERE parent_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `;
  await sql`ALTER TABLE words DROP COLUMN parent_id`;
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
