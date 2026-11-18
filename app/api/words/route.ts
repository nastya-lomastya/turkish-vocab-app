import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";
import { LANGUAGE, NATIVE } from "@/lib/language";

export async function GET() {
  await ensureTable();
  const rows = await sql`SELECT * FROM words ORDER BY added DESC`;
  const links = await sql`SELECT example_id, word_id FROM example_links`;
  return NextResponse.json({ words: rows, links });
}

export async function POST(req: Request) {
  await ensureTable();
  const body = await req.json();
  const { id, added } = body;
  const parents: string[] = Array.isArray(body.parents) ? body.parents : [];
  // Everything is stored in lowercase (locale-aware, so Turkish I/İ → ı/i).
  const tr = String(body.tr ?? "").trim().toLocaleLowerCase(LANGUAGE.code);
  const ru = String(body.ru ?? "").trim().toLocaleLowerCase(NATIVE.code);

  if (!id || !tr || !ru) {
    return NextResponse.json({ error: "id, tr and ru are required" }, { status: 400 });
  }

  await sql`
    INSERT INTO words (id, tr, ru, added, correct, wrong)
    VALUES (${id}, ${tr}, ${ru}, ${added ?? Date.now()}, 0, 0)
    ON CONFLICT (id) DO NOTHING
  `;
  for (const wordId of parents) {
    await sql`INSERT INTO example_links (example_id, word_id) VALUES (${id}, ${wordId}) ON CONFLICT DO NOTHING`;
  }
  return NextResponse.json({ ok: true });
}
