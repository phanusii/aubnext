// รัน region เดียวกับ DB เพื่อให้การอุ่น DB ไม่ข้าม region
export const preferredRegion = "iad1";

import { connection, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  await connection();
  // อุ่น Neon ล่วงหน้าระหว่างที่แอดมินอยู่หน้า login (กดเข้าระบบทีหลังจะได้ไม่รอ DB ตื่น)
  // ถูกเรียกตอนเปิดหน้า admin เสมอ — ผู้ใช้พิมพ์อีเมล/รหัสไป DB ตื่นรอไป พอ submit ก็เร็ว
  await getPrisma().$queryRaw`SELECT 1`.catch(() => {});

  if (!(await requireAdmin())) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}
