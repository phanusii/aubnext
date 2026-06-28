// รัน function ใน region เดียวกับ DB (US East) — ลด round-trip ต่อ query
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getLineBoundResult } from "@/lib/repository";
import {
  signStudentIdentityCookie,
  signStudentResultCookie,
  studentIdentityCookieMaxAgeSeconds,
  studentIdentityCookieName,
  studentResultCookieMaxAgeSeconds,
  studentResultCookieName,
} from "@/lib/security";

const schema = z.object({
  lineUserId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ไม่พบ LINE userId" }, { status: 400 });
  }

  const result = await getLineBoundResult(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, result: result.result });
  response.cookies.set(studentResultCookieName(), signStudentResultCookie(result.lookup), {
    httpOnly: true,
    maxAge: studentResultCookieMaxAgeSeconds(),
    path: "/check-result",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  // คุกกี้ระบุตัวแบบยาว → ครั้งหน้ากดเมนู "เช็คผลผ่านเว็บ" เปิดผลตรง ๆ ไม่ต้องผ่าน LIFF
  response.cookies.set(studentIdentityCookieName(), signStudentIdentityCookie(result.lookup.examNo), {
    httpOnly: true,
    maxAge: studentIdentityCookieMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
