import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPrivateResult, findUnpublishedStudentExam } from "@/lib/repository";

const schema = z.object({
  examNo: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
  }

  const result = await checkPrivateResult({
    examNo: parsed.data.examNo,
  });

  if (!result) {
    const unpublished = await findUnpublishedStudentExam({
      examNo: parsed.data.examNo,
    });
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

  return NextResponse.json(result);
}
