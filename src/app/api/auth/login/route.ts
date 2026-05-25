import { NextResponse } from "next/server";
import { adminCookieName, signAdminCookie } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const expected = process.env.ADMIN_PASSWORD || "admin1234";

  if (password !== expected) {
    return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), signAdminCookie(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
