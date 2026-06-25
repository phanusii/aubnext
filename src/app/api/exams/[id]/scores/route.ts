import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getExamScoreSheet, saveExamScores } from "@/lib/repository";

export const preferredRegion = "iad1";

// โหลดตารางกรอกคะแนน (วิชา + นักเรียน + คะแนนที่กรอกไว้)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sheet = await getExamScoreSheet(id);
  if (!sheet) return NextResponse.json({ error: "ไม่พบรอบสอบ" }, { status: 404 });
  return NextResponse.json(sheet);
}

const schema = z.object({
  updates: z.array(
    z.object({
      studentId: z.string().min(1),
      // ค่า null = ลบคะแนน (ยังไม่กรอก)
      scores: z.record(z.string(), z.number().nullable()),
      // true/false = ติ๊ก/ยกเลิก "ไม่ได้เข้าสอบ"
      absent: z.boolean().optional(),
    }),
  ),
});

// บันทึก/แก้คะแนนรายคน
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลคะแนนไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { id } = await params;
    const result = await saveExamScores({ examSessionId: id, updates: parsed.data.updates });
    if (!result.ok) return NextResponse.json({ error: result.errors.join(" · ") }, { status: 400 });
    return NextResponse.json({ ok: true, saved: result.saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกคะแนนไม่สำเร็จ" }, { status: 400 });
  }
}
