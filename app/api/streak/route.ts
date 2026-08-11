import { NextResponse } from "next/server";
import { sql, ensureStreakTable } from "@/lib/db";

export async function GET() {
  await ensureStreakTable();
  const rows = await sql`
    SELECT day, seconds FROM streak_days ORDER BY day DESC LIMIT 400
  `;
  return NextResponse.json({ days: rows });
}

export async function POST(req: Request) {
  await ensureStreakTable();
  const { day, deltaSeconds } = await req.json();

  if (!day || !deltaSeconds || deltaSeconds <= 0) {
    return NextResponse.json({ error: "day and a positive deltaSeconds are required" }, { status: 400 });
  }

  await sql`
    INSERT INTO streak_days (day, seconds)
    VALUES (${day}, ${deltaSeconds})
    ON CONFLICT (day) DO UPDATE SET seconds = streak_days.seconds + ${deltaSeconds}
  `;
  return NextResponse.json({ ok: true });
}
