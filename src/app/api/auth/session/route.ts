// รัน region เดียวกับ DB เพื่อให้การอุ่น DB ไม่ข้าม region
export const preferredRegion = "iad1";

import { after, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // ตรวจ session ใช้ signed cookie เท่านั้น จึงต้องตอบเร็ว ไม่รอ DB
  // ส่วนการอุ่น Neon ให้ทำหลังส่ง response แล้ว เพื่อไม่ให้หน้า refresh ค้างที่ "กำลังตรวจสอบสิทธิ์"
  after(async () => {
    const { getPrisma } = await import("@/lib/prisma");
    await getPrisma().$queryRaw`SELECT 1`.catch(() => {});
  });

  return NextResponse.json({ authenticated: true });
}
