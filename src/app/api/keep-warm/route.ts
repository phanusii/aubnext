// ตรวจการเชื่อมต่อ Neon ด้วย SELECT 1 สำหรับปุ่มเตรียมระบบในหน้าแอดมิน
// รัน region เดียวกับ DB ใหม่ (US East) เพื่อลด network latency
// route handler นี้อ่าน searchParams (request.url) จึงเป็น dynamic อยู่แล้ว + ตอบ no-store
// (cacheComponents เลิกใช้ `export const dynamic` แล้ว)
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  // กันคนสุ่มยิงจน DB ตื่นโดยไม่ตั้งใจ (เปลือง compute hours): ถ้าตั้ง KEEP_WARM_SECRET ต้องส่ง ?key= ให้ตรง
  // หรือเป็น admin ที่ล็อกอินอยู่ (ปุ่ม "ปลุก DB เตรียมประกาศ" ในหน้า admin) ก็ปลุกได้โดยไม่ต้องรู้ secret
  const secret = process.env.KEEP_WARM_SECRET;
  if (secret) {
    const key = new URL(request.url).searchParams.get("key");
    if (key !== secret && !(await requireAdmin())) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, warmMs: Date.now() - startedAt, region: process.env.VERCEL_REGION || "local" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "query failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
