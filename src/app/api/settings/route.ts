import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSchoolSettings, upsertSchoolSettings } from "@/lib/repository";

const schema = z.object({
  schoolName: z.string().min(1),
  examTitle: z.string().min(1),
  logoUrl: z.string().optional().nullable(),
  activeExamSessionId: z.string().optional().nullable(),
});

export async function GET() {
  const settings = await getSchoolSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลตั้งค่าไม่ถูกต้อง" }, { status: 400 });
  }

  const settings = await upsertSchoolSettings(parsed.data);
  return NextResponse.json(settings);
}
