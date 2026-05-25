import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPublicResultSettings, upsertSchoolSettings } from "@/lib/repository";

const schema = z.object({
  schoolName: z.string().min(1),
  examTitle: z.string().min(1).optional(),
  logoUrl: z.string().max(1_400_000, "โลโก้ใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 1MB").optional().nullable(),
  activeExamSessionId: z.string().optional().nullable(),
});

export async function GET() {
  const settings = await getPublicResultSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: issue ?? "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const settings = await upsertSchoolSettings(parsed.data);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Save settings failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "บันทึกตั้งค่าไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
