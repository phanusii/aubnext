import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import { updateSubjectMaxScore } from "@/lib/repository";

const schema = z.object({
  maxScore: z.number().positive(),
  mode: z.enum(["KEEP_SCORES", "SCALE_SCORES"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subjectId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลคะแนนเต็มไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const { id, subjectId } = await params;
    const result = await updateSubjectMaxScore({
      examSessionId: id,
      subjectId,
      maxScore: parsed.data.maxScore,
      mode: parsed.data.mode,
    });
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "แก้คะแนนเต็มไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
