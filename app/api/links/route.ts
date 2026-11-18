import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";

// Attach an example to a word.
export async function POST(req: Request) {
  await ensureTable();
  const { example_id, word_id } = await req.json();
  if (!example_id || !word_id || example_id === word_id) {
    return NextResponse.json({ error: "example_id and word_id are required" }, { status: 400 });
  }
  await sql`INSERT INTO example_links (example_id, word_id) VALUES (${example_id}, ${word_id}) ON CONFLICT DO NOTHING`;
  return NextResponse.json({ ok: true });
}

// Detach an example from a word. With no links left it returns to the main list.
export async function DELETE(req: Request) {
  await ensureTable();
  const { example_id, word_id } = await req.json();
  if (!example_id || !word_id) {
    return NextResponse.json({ error: "example_id and word_id are required" }, { status: 400 });
  }
  await sql`DELETE FROM example_links WHERE example_id = ${example_id} AND word_id = ${word_id}`;
  return NextResponse.json({ ok: true });
}
