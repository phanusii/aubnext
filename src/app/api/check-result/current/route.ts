import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";
import {
  getCachedPublishedStudentResultSession,
  publicStudentResultCacheTag,
} from "@/lib/public-student-result-cache";
import {
  findPublishedStudentResultSession,
  rebuildPublicResultCache,
  type PublishedStudentResultSession,
} from "@/lib/repository";
import { createResultRequestTrace } from "@/lib/result-request-trace";
import { readStudentResultCookie, studentResultCookieName } from "@/lib/security";

async function repairMissingCache(
  lookup: PublishedStudentResultSession["lookup"],
  trace: ReturnType<typeof createResultRequestTrace>,
) {
  trace.mark("cache_repair_start");
  const rebuilt = await rebuildPublicResultCache(lookup.examSessionId);
  trace.mark("cache_repair_rebuild", { updated: rebuilt.updated });
  revalidateTag(publicStudentResultCacheTag, { expire: 0 });

  const repaired = await findPublishedStudentResultSession(lookup);
  trace.mark("cache_repair_lookup", {
    found: Boolean(repaired),
    cacheMissing: Boolean(repaired && "cacheMissing" in repaired),
  });
  return repaired && !("cacheMissing" in repaired) ? repaired : null;
}

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

  let session = await getCachedPublishedStudentResultSession(lookup);
  trace.mark("public_lookup", {
    found: Boolean(session),
    cacheMissing: Boolean(session && "cacheMissing" in session),
  });

  if (session && "cacheMissing" in session) {
    session = await repairMissingCache(session.lookup, trace);
    if (!session) {
      const settings = await getCachedPublicResultSettings();
      trace.mark("settings_lookup");
      trace.done("cache_missing");
      return NextResponse.json(
        {
          error: "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง",
          settings,
        },
        { status: 503, headers: trace.headers() },
      );
    }
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
