export const preferredRegion = "sin1";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteStudent } from "@/lib/repository";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";

// ลบนักเรียนรายคนออกจากรอบสอบ
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; studentId: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { studentId } = await params;
  const result = await deleteStudent(studentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  revalidateTag(publicStudentResultCacheTag, { expire: 0 });
  return NextResponse.json({ ok: true });
}
