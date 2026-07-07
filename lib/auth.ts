// Computes a stable HMAC-SHA256 token from SESSION_SECRET.
// Used as the value of the login cookie: we never store the password itself
// in the cookie, just proof that whoever set it knew it at login time.
export async function getSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET || "insecure-default-change-me";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("authenticated"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const SESSION_COOKIE = "vt_session";
