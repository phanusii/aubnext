import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSchoolSettings } from "@/lib/repository";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getSchoolSettings();
  return NextResponse.json({
    schoolName: settings.schoolName,
    examTitle: settings.examTitle,
    logoUrl: settings.logoUrl,
    activeExamSessionId: settings.activeExamSessionId,
    schoolContact: settings.schoolContact,
    adminEmail: settings.adminEmail || process.env.ADMIN_EMAIL || "admin@example.com",
    lineRichMenuImageUrl: settings.lineRichMenuImageUrl,
  });
}
