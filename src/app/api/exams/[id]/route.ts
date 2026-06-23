export const preferredRegion = "sin1";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteExamSession } from "@/lib/repository";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";

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
