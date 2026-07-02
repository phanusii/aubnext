export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteExamSession, updateExamSession } from "@/lib/repository";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  classLevel: z.string().min(1).optional(),
  selectionMode: z.enum(["PER_ROOM", "WHOLE_LEVEL"]).optional(),
  wholeLevelQuota: z.number().int().nonnegative().optional().nullable(),
  passTitle: z.string().max(300).optional().nullable(),
  passInstructions: z.string().max(3_000).optional().nullable(),
  eventLogoUrl: z.string().max(1_400_000, "โลโก้งานใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 1MB").optional().nullable(),
  showEventLogo: z.boolean().optional(),
  scoreDisplayMode: z.enum(["RAW", "PERCENT"]).optional(),
});

// แก้ไขข้อมูลรอบสอบ (ชื่อ/ชั้น/รูปแบบคัดเลือก/โควตารวม)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลรอบสอบไม่ถูกต้อง" }, { status: 400 });
  }
  try {
    const { id } = await params;
    const result = await updateExamSession({ examSessionId: id, ...parsed.data });
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "แก้ไขรอบสอบไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

// ลบรอบสอบทั้งรอบ (ถาวร)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteExamSession(id);
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ลบรอบสอบไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
