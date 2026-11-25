import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";
import { LANGUAGE, NATIVE } from "@/lib/language";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  const body = await req.json();

  if (body.correct !== undefined && body.wrong !== undefined) {
    await sql`UPDATE words SET correct = ${body.correct}, wrong = ${body.wrong} WHERE id = ${id}`;
  }
  // Editing the word / translation; stored lowercase like on insert.
  if (typeof body.tr === "string" && body.tr.trim()) {
    await sql`UPDATE words SET tr = ${body.tr.trim().toLocaleLowerCase(LANGUAGE.code)} WHERE id = ${id}`;
  }
  if (typeof body.ru === "string" && body.ru.trim()) {
    await sql`UPDATE words SET ru = ${body.ru.trim().toLocaleLowerCase(NATIVE.code)} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  // Deleting a word also deletes the examples that belong only to it;
  // examples shared with other words just lose this link.
  await sql`
    DELETE FROM words
    WHERE id IN (SELECT example_id FROM example_links WHERE word_id = ${id})
      AND NOT EXISTS (
        SELECT 1 FROM example_links l WHERE l.example_id = words.id AND l.word_id <> ${id}
      )
  `;
  await sql`DELETE FROM words WHERE id = ${id}`;
  await sql`
    DELETE FROM example_links
    WHERE word_id = ${id} OR example_id = ${id} OR example_id NOT IN (SELECT id FROM words)
  `;
  return NextResponse.json({ ok: true });
}
