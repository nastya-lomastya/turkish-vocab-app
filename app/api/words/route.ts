import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";
import { LANGUAGE, NATIVE } from "@/lib/language";

export async function GET() {
  await ensureTable();
  const rows = await sql`SELECT * FROM words ORDER BY added DESC`;
  return NextResponse.json({ words: rows });
}

export async function POST(req: Request) {
  await ensureTable();
  const body = await req.json();
  const { id, added, parent_id } = body;
  // Everything is stored in lowercase (locale-aware, so Turkish I/İ → ı/i).
  const tr = String(body.tr ?? "").trim().toLocaleLowerCase(LANGUAGE.code);
  const ru = String(body.ru ?? "").trim().toLocaleLowerCase(NATIVE.code);

  if (!id || !tr || !ru) {
    return NextResponse.json({ error: "id, tr and ru are required" }, { status: 400 });
  }

  await sql`
    INSERT INTO words (id, tr, ru, added, correct, wrong, parent_id)
    VALUES (${id}, ${tr}, ${ru}, ${added ?? Date.now()}, 0, 0, ${parent_id ?? null})
    ON CONFLICT (id) DO NOTHING
  `;
  return NextResponse.json({ ok: true });
}
