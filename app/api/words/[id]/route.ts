import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  const body = await req.json();

  if (body.correct !== undefined && body.wrong !== undefined) {
    await sql`UPDATE words SET correct = ${body.correct}, wrong = ${body.wrong} WHERE id = ${id}`;
  }
  if (body.parent_id !== undefined) {
    // null detaches an example back into the main word list
    await sql`UPDATE words SET parent_id = ${body.parent_id} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  // Deleting a word also deletes its examples.
  await sql`DELETE FROM words WHERE id = ${id} OR parent_id = ${id}`;
  return NextResponse.json({ ok: true });
}
