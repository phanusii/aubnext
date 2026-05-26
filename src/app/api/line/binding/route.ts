import { NextResponse } from "next/server";
import { z } from "zod";
import { getLineBindingStatus } from "@/lib/repository";

const schema = z.object({
  lineUserId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูล LINE ไม่ถูกต้อง" }, { status: 400 });
  }

  const result = await getLineBindingStatus(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
