// รัน function ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ต่อ query
export const preferredRegion = "sin1";

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
  verifyLineResultWebLookup,
  type PublishedStudentResultSession,
  type PublicStudentResultLookup,
} from "@/lib/repository";
import { createResultRequestTrace } from "@/lib/result-request-trace";
import {
  readLineResultWebToken,
  readStudentResultCookie,
  signStudentResultCookie,
  studentResultCookieMaxAgeSeconds,
  studentResultCookieName,
} from "@/lib/security";

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

async function findSessionWithRepair(
  lookup: PublicStudentResultLookup,
  trace: ReturnType<typeof createResultRequestTrace>,
) {
  const session = await getCachedPublishedStudentResultSession(lookup);
  trace.mark("public_lookup", {
    found: Boolean(session),
    cacheMissing: Boolean(session && "cacheMissing" in session),
  });

  if (session && "cacheMissing" in session) {
    const repaired = await repairMissingCache(session.lookup, trace);
    return { session: repaired, cacheMissing: !repaired };
  }

  return { session, cacheMissing: false };
}

export async function GET(request: Request) {
  const trace = createResultRequestTrace("check-result-current");
  const lineResultToken = new URL(request.url).searchParams.get("lineResultToken");
  const cookieStore = await cookies();
  const lookup = readStudentResultCookie(cookieStore.get(studentResultCookieName())?.value);
  trace.mark("read_cookie", { hasLookup: Boolean(lookup), hasLineToken: Boolean(lineResultToken) });

  if (!lookup) {
    const signedLineLookup = readLineResultWebToken(lineResultToken);
    const lineLookup = signedLineLookup ? await verifyLineResultWebLookup(signedLineLookup) : null;
    trace.mark("line_token_lookup", { hasLookup: Boolean(lineLookup) });

    if (lineLookup) {
      const { session, cacheMissing } = await findSessionWithRepair(lineLookup, trace);
      if (!session) {
        const settings = await getCachedPublicResultSettings();
        trace.mark("settings_lookup");
        trace.done(cacheMissing ? "line_cache_missing" : "line_not_found");
        return NextResponse.json(
          {
            error: cacheMissing
              ? "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง"
              : "ไม่พบผลคะแนนสำหรับบัญชี LINE นี้ กรุณากลับไปผูกบัญชีอีกครั้ง",
            settings,
          },
          { status: cacheMissing ? 503 : 404, headers: trace.headers() },
        );
      }

      trace.done("line_cache_hit");
      const response = NextResponse.json({ ok: true, result: session.result }, { headers: trace.headers() });
      response.cookies.set(studentResultCookieName(), signStudentResultCookie(session.lookup), {
        httpOnly: true,
        maxAge: studentResultCookieMaxAgeSeconds(),
        path: "/check-result",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

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

  const { session, cacheMissing } = await findSessionWithRepair(lookup, trace);
  if (!session) {
    const settings = await getCachedPublicResultSettings();
    trace.mark("settings_lookup");
    trace.done(cacheMissing ? "cache_missing" : "not_found");
    return NextResponse.json(
      {
        error: cacheMissing
          ? "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง"
          : "ไม่พบ session สำหรับดูผล หรือ session หมดอายุแล้ว กรุณากลับไปกรอกรหัสนักเรียนอีกครั้ง",
        settings,
      },
      { status: cacheMissing ? 503 : 404, headers: trace.headers() },
    );
  }

  trace.done("cache_hit");
  return NextResponse.json({ ok: true, result: session.result }, { headers: trace.headers() });
}
