// รัน region เดียวกับ DB เพื่อลด round-trip ตอนอ่าน credential
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { getAdminCredentials } from "@/lib/repository";
import { adminCookieName, signAdminCookie, verifyPassword } from "@/lib/security";

// จำกัดจำนวนครั้งที่ "ล็อกอินพลาด" ต่อ IP กัน brute-force รหัสผ่าน
// เก็บในหน่วยความจำของ instance (Fluid Compute ใช้ instance ซ้ำ) — รีเซ็ตเมื่อ cold start
// นับเฉพาะครั้งที่พลาด → ล็อกอินสำเร็จไม่ทำให้ถูกล็อก (กัน DoS ใส่ admin ตัวจริง)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function recentFailures(ip: string, now: number) {
  const list = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(ip, list);
  else failures.delete(ip);
  return list;
}

function recordFailure(ip: string, now: number) {
  const list = recentFailures(ip, now);
  list.push(now);
  failures.set(ip, list);
  // เก็บกวาดกัน map โตไม่จำกัด
  if (failures.size > 5000) {
    for (const [key, times] of failures) {
      if (times.every((t) => now - t >= WINDOW_MS)) failures.delete(key);
    }
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const now = Date.now();

  if (recentFailures(ip, now).length >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const expected = await getAdminCredentials();

  if (email !== expected.email || !verifyPassword(password, expected.passwordHash)) {
    recordFailure(ip, now);
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  failures.delete(ip);
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
