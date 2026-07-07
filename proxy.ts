import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await getSessionToken();

  if (cookie === expected) {
    // Sliding expiry: touching the app resets the idle timer.
    const res = NextResponse.next();
    res.cookies.set(SESSION_COOKIE, expected, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
