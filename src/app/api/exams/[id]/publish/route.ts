import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import { publishExam } from "@/lib/repository";

const schema = z.object({
  passTitle: z.string().max(300).optional().nullable(),
  passInstructions: z.string().max(3_000).optional().nullable(),
  scoreDisplayMode: z.enum(["RAW", "PERCENT"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อความแจ้งผู้ผ่านไม่ถูกต้อง" }, { status: 400 });
  }

  const { id } = await params;
  const result = await publishExam(id, parsed.data);
  revalidateTag(publicSettingsCacheTag, { expire: 0 });
  revalidateTag(publicStudentResultCacheTag, { expire: 0 });
  return NextResponse.json({ ok: true, ...result });
}
