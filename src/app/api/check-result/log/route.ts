// รัน region เดียวกับ DB เพื่อลด round-trip ตอน upsert
export const preferredRegion = "iad1";

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordResultView } from "@/lib/repository";
import {
  readStudentIdentityCookie,
  readStudentResultCookie,
  studentIdentityCookieName,
  studentResultCookieName,
} from "@/lib/security";

// beacon บันทึกประวัติการเข้าดูผล — ฝั่ง client ยิงเงียบ ๆ ตอนหน้าผลแสดงสำเร็จ
// ระบุตัวจาก cookie ที่เซ็นไว้ (ปลอมไม่ได้) ไม่รับ examNo จาก body เพื่อกันปลอม
export async function POST() {
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);
  const examNo = lookup?.examNo ?? readStudentIdentityCookie(cookieStore.get(studentIdentityCookieName())?.value);
  if (!examNo) {
    return NextResponse.json({ ok: false });
  }

  const ua = (await headers()).get("user-agent") ?? "";
  const channel = /\bLine\//i.test(ua) ? "line" : "web";

  try {
    await recordResultView({ examNo, channel });
  } catch {
    // ประวัติเป็นข้อมูลเสริม — ถ้าบันทึกพลาดก็ไม่ต้องแจ้ง error ให้ผู้ใช้
  }
  return NextResponse.json({ ok: true });
}
