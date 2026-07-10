import { NextResponse } from "next/server";
import { sql, ensureTable } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  const body = await req.json();

  if (body.forms !== undefined) {
    await sql`UPDATE words SET forms = ${JSON.stringify(body.forms)} WHERE id = ${id}`;
  }
  if (body.correct !== undefined && body.wrong !== undefined) {
    await sql`UPDATE words SET correct = ${body.correct}, wrong = ${body.wrong} WHERE id = ${id}`;
  }
  if (body.transcription !== undefined) {
    await sql`UPDATE words SET transcription = ${body.transcription} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTable();
  const { id } = await params;
  await sql`DELETE FROM words WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
