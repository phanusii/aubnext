// รัน function ใน region เดียวกับ DB (US East) — ลด round-trip ต่อ query ของเว็บเช็คผล
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  findPublishedStudentResultSession,
  findUnpublishedStudentExam,
  rebuildPublicResultCache,
} from "@/lib/repository";
import {
  getCachedPublishedStudentResultSession,
  publicStudentResultCacheTag,
} from "@/lib/public-student-result-cache";

const schema = z.object({
  examNo: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
  }

  let published = await getCachedPublishedStudentResultSession(parsed.data.examNo);

  if (published && "cacheMissing" in published) {
    await rebuildPublicResultCache(published.lookup.examSessionId);
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    const repaired = await findPublishedStudentResultSession(published.lookup);
    published = repaired && !("cacheMissing" in repaired) ? repaired : published;
    if ("cacheMissing" in published) {
      return NextResponse.json(
        {
          error: "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง",
        },
        { status: 503 },
      );
    }
  }

  if (!published) {
    const unpublished = await findUnpublishedStudentExam({
      examNo: parsed.data.examNo,
    });
    if (unpublished) {
      return NextResponse.json(
        {
          error: unpublished.hasCalculatedResult
            ? "พบรหัสนักเรียนนี้แล้ว แต่รอบสอบยังไม่ได้ประกาศผล"
            : "พบรหัสนักเรียนนี้แล้ว แต่ยังไม่ได้คำนวณและประกาศผล",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "ไม่พบผลสอบที่ประกาศแล้ว หรือรหัสนักเรียนไม่ถูกต้อง" },
      { status: 404 },
    );
  }

  return NextResponse.json(published.result);
}
