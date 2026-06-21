// ปลุก Neon compute (free tier scale-to-zero) ด้วย SELECT 1 — ลด cold start ของ query แรก
// ใช้คู่กับ external pinger (UptimeRobot/cron-job.org) ยิงทุก ~5 นาทีเฉพาะช่วงที่อยากให้ DB ตื่น
// (อย่ายิง 24/7 บน Neon free — compute .25 CU ตลอดเวลา = ~180 CU-hrs/เดือน เกินโควตาฟรี 100)
// รัน region เดียวกับ DB (สิงคโปร์)
// route handler นี้อ่าน searchParams (request.url) จึงเป็น dynamic อยู่แล้ว + ตอบ no-store
// (cacheComponents เลิกใช้ `export const dynamic` แล้ว)
export const preferredRegion = "sin1";

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  // กันคนสุ่มยิงจน DB ตื่นโดยไม่ตั้งใจ (เปลือง compute hours): ถ้าตั้ง KEEP_WARM_SECRET ต้องส่ง ?key= ให้ตรง
  const secret = process.env.KEEP_WARM_SECRET;
  if (secret) {
    const key = new URL(request.url).searchParams.get("key");
    if (key !== secret) {
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
