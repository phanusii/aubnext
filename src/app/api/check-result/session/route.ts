import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPrivateResult, findUnpublishedStudentExam } from "@/lib/repository";
import {
  signStudentResultCookie,
  studentResultCookieMaxAgeSeconds,
  studentResultCookieName,
} from "@/lib/security";

const schema = z.object({
  examNo: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณากรอกรหัสนักเรียน" }, { status: 400 });
  }

  const examNo = parsed.data.examNo.trim();
  const result = await checkPrivateResult({ examNo });

  if (!result) {
    const unpublished = await findUnpublishedStudentExam({ examNo });
    if (unpublished) {
      return NextResponse.json(
        {
          error: unpublished.hasCalculatedResult
            ? "พบรหัสนักเรียนนี้แล้ว แต่รอบสอบยังไม่ได้ประกาศผล"
            : "พบรหัสนักเรียนนี้แล้ว แต่ยังไม่ได้คำนวณและประกาศผล",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "ไม่พบผลสอบที่ประกาศแล้ว หรือรหัสนักเรียนไม่ถูกต้อง" },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(studentResultCookieName(), signStudentResultCookie(examNo), {
    httpOnly: true,
    maxAge: studentResultCookieMaxAgeSeconds(),
    path: "/check-result",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
