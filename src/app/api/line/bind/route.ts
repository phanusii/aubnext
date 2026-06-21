// รัน function ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ต่อ query
export const preferredRegion = "sin1";

import { NextResponse } from "next/server";
import { z } from "zod";
import { bindLineStudent } from "@/lib/repository";

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

  return NextResponse.json(result);
}
