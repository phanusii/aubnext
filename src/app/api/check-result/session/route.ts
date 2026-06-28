// รัน function ใน region เดียวกับ DB (US East) — ลด round-trip ต่อ query
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  findPublishedStudentResultSession,
  findUnpublishedStudentExam,
  rebuildPublicResultCache,
  type PublishedStudentResultSession,
} from "@/lib/repository";
import {
  getCachedPublishedStudentResultSession,
  publicStudentResultCacheTag,
} from "@/lib/public-student-result-cache";
import { createResultRequestTrace } from "@/lib/result-request-trace";
import {
  signStudentIdentityCookie,
  signStudentResultCookie,
  studentIdentityCookieMaxAgeSeconds,
  studentIdentityCookieName,
  studentResultCookieMaxAgeSeconds,
  studentResultCookieName,
} from "@/lib/security";

const schema = z.object({
  examNo: z.string().min(1),
});

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

export async function POST(request: Request) {
  const trace = createResultRequestTrace("check-result-session");
  const parsed = schema.safeParse(await request.json());
  trace.mark("parse");
  if (!parsed.success) {
    trace.done("invalid_input");
    return NextResponse.json({ error: "กรุณากรอกรหัสนักเรียน" }, { status: 400, headers: trace.headers() });
  }

  const examNo = parsed.data.examNo.trim();
  let published = await getCachedPublishedStudentResultSession(examNo);
  trace.mark("public_lookup", {
    found: Boolean(published),
    cacheMissing: Boolean(published && "cacheMissing" in published),
  });

  if (published && "cacheMissing" in published) {
    published = await repairMissingCache(published.lookup, trace);
    if (!published) {
      trace.done("cache_missing", { requestId: trace.requestId });
      return NextResponse.json(
        {
          error: "พบผลสอบแล้ว แต่ระบบกำลังเตรียมข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง",
        },
        { status: 503, headers: trace.headers() },
      );
    }
  }

  if (!published) {
    const unpublished = await findUnpublishedStudentExam({ examNo });
    trace.mark("unpublished_lookup", { found: Boolean(unpublished) });
    if (unpublished) {
      trace.done("unpublished_found", { hasCalculatedResult: unpublished.hasCalculatedResult });
      return NextResponse.json(
        {
          error: unpublished.hasCalculatedResult
            ? "พบรหัสนักเรียนนี้แล้ว แต่รอบสอบยังไม่ได้ประกาศผล"
            : "พบรหัสนักเรียนนี้แล้ว แต่ยังไม่ได้คำนวณและประกาศผล",
        },
        { status: 409, headers: trace.headers() },
      );
    }

    trace.done("not_found");
    return NextResponse.json(
      { error: "ไม่พบผลสอบที่ประกาศแล้ว หรือรหัสนักเรียนไม่ถูกต้อง" },
      { status: 404, headers: trace.headers() },
    );
  }

  const response = NextResponse.json({ ok: true, result: published.result }, { headers: trace.headers() });
  response.cookies.set(studentResultCookieName(), signStudentResultCookie(published.lookup), {
    httpOnly: true,
    maxAge: studentResultCookieMaxAgeSeconds(),
    path: "/check-result",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  // คุกกี้ระบุตัวแบบยาว → ครั้งหน้าเปิดหน้าผลตรง ๆ ได้ ไม่ต้องกรอกรหัสซ้ำ
  response.cookies.set(studentIdentityCookieName(), signStudentIdentityCookie(published.lookup.examNo), {
    httpOnly: true,
    maxAge: studentIdentityCookieMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  trace.done("cache_hit", { requestId: trace.requestId });
  return response;
}
