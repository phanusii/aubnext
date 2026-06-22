// รัน function ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ต่อ query
export const preferredRegion = "sin1";

import { NextResponse } from "next/server";
import { z } from "zod";
import { bindLineStudent, getLineBoundResult } from "@/lib/repository";
import { buildResultFlexMessage, hasLineMessagingConfig, pushLineMessage } from "@/lib/line-messaging";

const schema = z.object({
  lineUserId: z.string().min(1),
  examNo: z.string().min(1),
  lineName: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลผูกบัญชีไม่ถูกต้อง" }, { status: 400 });
  }

  const result = await bindLineStudent(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // ผูกสำเร็จ → push การ์ดผลคะแนนเข้าแชททันที (นักเรียนไม่ต้องกดดูผลซ้ำ)
  // ถ้า push ไม่ได้ (ยังไม่ประกาศผล / ไม่ได้เพิ่มเพื่อน / config ไม่ครบ) ก็ไม่ทำให้การผูกล้มเหลว
  let resultPushed = false;
  if (hasLineMessagingConfig()) {
    try {
      const bound = await getLineBoundResult({ lineUserId: parsed.data.lineUserId });
      if (bound.ok) {
        await pushLineMessage(parsed.data.lineUserId, [buildResultFlexMessage(bound.result, bound.lookup)]);
        resultPushed = true;
      }
    } catch (error) {
      console.error("Push result card after bind failed", error);
    }
  }

  return NextResponse.json({ ...result, resultPushed });
}
