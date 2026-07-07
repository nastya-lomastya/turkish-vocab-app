import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";

export async function GET() {
  await ensureTable();
  const rows = await sql`SELECT * FROM words ORDER BY added DESC`;
  return NextResponse.json({ words: rows });
}

export async function POST(req: Request) {
  await ensureTable();
  const body = await req.json();
  const { id, tr, ru, added, forms } = body;

  if (!id || !tr || !ru) {
    return NextResponse.json({ error: "id, tr and ru are required" }, { status: 400 });
  }

  await sql`
    INSERT INTO words (id, tr, ru, added, correct, wrong, forms)
    VALUES (${id}, ${tr}, ${ru}, ${added ?? Date.now()}, 0, 0, ${JSON.stringify(forms ?? [])})
    ON CONFLICT (id) DO NOTHING
  `;
  return NextResponse.json({ ok: true });
}
