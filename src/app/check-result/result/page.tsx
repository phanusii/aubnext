// รัน SSR ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ตอนอ่าน cookie + lookup ผล
export const preferredRegion = "sin1";
// อ่าน cookie ต่อ request จึงต้อง dynamic
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { ResultPageClient } from "@/components/ResultPageClient";
import { getCachedPublishedStudentResultSession } from "@/lib/public-student-result-cache";
import {
  readStudentResultCookie,
  studentResultCookieName,
} from "@/lib/security";
import type { StudentResult } from "@/components/PublicResultView";

export default async function ResultPage() {
  // อ่านผลจาก cookie ฝั่ง server เลย (เคส refresh / เปิดลิงก์ใหม่ / คนละ tab ที่ไม่มี sessionStorage)
  // ได้ initialResult ไป render ทันทีตั้งแต่ SSR — ตัด client fetch /api/check-result/current ทิ้ง
  // flow ผ่าน LINE token (ยังไม่มี cookie) จะได้ initialResult = null แล้วให้ client แลก token ตามเดิม
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);

  let initialResult: StudentResult | null = null;
  if (lookup) {
    const session = await getCachedPublishedStudentResultSession(lookup);
    if (session && !("cacheMissing" in session)) {
      initialResult = session.result as StudentResult;
    }
  }

  return <ResultPageClient initialResult={initialResult} />;
}
