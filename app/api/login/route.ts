import { NextResponse } from "next/server";
import { getSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const token = await getSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
