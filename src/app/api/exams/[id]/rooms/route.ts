import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import { saveExamRooms } from "@/lib/repository";

const schema = z.object({
  rooms: z.array(z.object({ room: z.string().min(1), quota: z.number().int().nonnegative() })),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลห้องไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const result = await saveExamRooms(id, parsed.data.rooms);
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกห้องไม่สำเร็จ" }, { status: 400 });
  }
}
