import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getCachedPublicResultSettings, publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import { upsertSchoolSettings } from "@/lib/repository";
import { verifierHash } from "@/lib/security";

const schema = z.object({
  schoolName: z.string().min(1),
  examTitle: z.string().min(1).optional(),
  logoUrl: z.string().max(1_400_000, "โลโก้ใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 1MB").optional().nullable(),
  activeExamSessionId: z.string().optional().nullable(),
  schoolContact: z.string().max(500).optional().nullable(),
  adminEmail: z.string().email("อีเมลผู้ดูแลไม่ถูกต้อง").optional(),
  adminPassword: z.string().optional(),
});

export async function GET() {
  const settings = await getCachedPublicResultSettings();
  return NextResponse.json(settings, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
    },
  });
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
    const adminPassword = parsed.data.adminPassword?.trim();
    if (adminPassword && adminPassword.length < 8) {
      return NextResponse.json({ error: "รหัสผ่านผู้ดูแลต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
    }

    const settings = await upsertSchoolSettings({
      schoolName: parsed.data.schoolName,
      examTitle: parsed.data.examTitle,
      logoUrl: parsed.data.logoUrl,
      activeExamSessionId: parsed.data.activeExamSessionId,
      schoolContact: parsed.data.schoolContact,
      adminEmail: parsed.data.adminEmail?.trim().toLowerCase(),
      ...(adminPassword ? { adminPasswordHash: verifierHash(adminPassword) } : {}),
    });
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({
      id: settings.id,
      schoolName: settings.schoolName,
      examTitle: settings.examTitle,
      logoUrl: settings.logoUrl,
      activeExamSessionId: settings.activeExamSessionId,
      schoolContact: settings.schoolContact,
      adminEmail: settings.adminEmail,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error("Save settings failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "บันทึกตั้งค่าไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
