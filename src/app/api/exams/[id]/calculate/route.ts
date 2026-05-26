import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import { calculateExamResults } from "@/lib/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const results = await calculateExamResults(id);
  revalidateTag(publicStudentResultCacheTag, { expire: 0 });
  return NextResponse.json({ ok: true, results });
}
