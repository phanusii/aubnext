import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { saveExamSubjects } from "@/lib/repository";

const schema = z.object({
  subjects: z.array(
    z.object({
      name: z.string().min(1),
      maxScore: z.number().positive(),
      sortOrder: z.number().int().nonnegative(),
      tieBreakOrder: z.number().int().positive().optional().nullable(),
    }),
  ),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลวิชาไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const { id } = await params;
    await saveExamSubjects(id, parsed.data.subjects);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกวิชาไม่สำเร็จ" }, { status: 400 });
  }
}
