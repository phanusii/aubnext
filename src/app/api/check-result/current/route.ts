import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";
import { getCachedPublishedStudentResultSession } from "@/lib/public-student-result-cache";
import { createResultRequestTrace } from "@/lib/result-request-trace";
import { readStudentResultCookie, studentResultCookieName } from "@/lib/security";

export async function GET() {
  const trace = createResultRequestTrace("check-result-current");
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);
  trace.mark("read_cookie", { hasLookup: Boolean(lookup) });

  if (!lookup) {
    const settings = await getCachedPublicResultSettings();
    trace.mark("settings_lookup");
    trace.done("missing_cookie");
    return NextResponse.json(
      {
        error: "ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง",
        settings,
      },
      { status: 401, headers: trace.headers() },
    );
  }

  const session = await getCachedPublishedStudentResultSession(lookup);
  trace.mark("public_lookup", {
    found: Boolean(session),
    cacheMissing: Boolean(session && "cacheMissing" in session),
  });

  if (session && "cacheMissing" in session) {
    const settings = await getCachedPublicResultSettings();
    trace.mark("settings_lookup");
    trace.done("cache_missing");
    return NextResponse.json(
      {
        error: "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง หรือแจ้งผู้ดูแลให้ซ่อมแคชผลประกาศ",
        settings,
      },
      { status: 503, headers: trace.headers() },
    );
  }

  if (!session) {
    const settings = await getCachedPublicResultSettings();
    trace.mark("settings_lookup");
    trace.done("not_found");
    return NextResponse.json(
      {
        error: "ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง",
        settings,
      },
      { status: 404, headers: trace.headers() },
    );
  }

  trace.done("cache_hit");
  return NextResponse.json({ ok: true, result: session.result }, { headers: trace.headers() });
}
