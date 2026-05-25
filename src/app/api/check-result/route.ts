import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPrivateResult } from "@/lib/repository";

const schema = z.object({
  examNo: z.string().min(1),
  birthdateOrPin: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
  }

  const result = await checkPrivateResult({
    examNo: parsed.data.examNo,
    verifier: parsed.data.birthdateOrPin,
  });

  if (!result) {
    return NextResponse.json(
      { error: "ไม่พบผลสอบที่ประกาศแล้ว หรือข้อมูลยืนยันตัวตนไม่ถูกต้อง" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
