// สำรองข้อมูลทั้งฐานข้อมูลเป็นไฟล์ JSON (admin เท่านั้น)
// Neon free เก็บ point-in-time ย้อนได้แค่ ~6 ชม. → ควรกดสำรองเก็บไว้เองเป็นระยะ โดยเฉพาะก่อน/หลังประกาศผล
// รัน region เดียวกับ DB เพื่อลด round-trip ตอน dump หลายตาราง
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  // ดึงทุกตารางตามลำดับ parent → child (เผื่อใช้ลำดับนี้ตอน restore)
  const [
    schoolSettings,
    examSessions,
    subjects,
    roomQuotas,
    students,
    scores,
    resultSnapshots,
    importBatches,
    lineBindings,
  ] = await Promise.all([
    prisma.schoolSettings.findMany(),
    prisma.examSession.findMany(),
    prisma.subject.findMany(),
    prisma.roomQuota.findMany(),
    prisma.student.findMany(),
    prisma.score.findMany(),
    prisma.resultSnapshot.findMany(),
    prisma.importBatch.findMany(),
    prisma.lineBinding.findMany(),
  ]);

  const backup = {
    meta: {
      app: "aubnext",
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        schoolSettings: schoolSettings.length,
        examSessions: examSessions.length,
        subjects: subjects.length,
        roomQuotas: roomQuotas.length,
        students: students.length,
        scores: scores.length,
        resultSnapshots: resultSnapshots.length,
        importBatches: importBatches.length,
        lineBindings: lineBindings.length,
      },
    },
    // ลำดับ key = ลำดับ insert ตอน restore (parent ก่อน child)
    data: {
      schoolSettings,
      examSessions,
      subjects,
      roomQuotas,
      students,
      scores,
      resultSnapshots,
      importBatches,
      lineBindings,
    },
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aubnext-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
