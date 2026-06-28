// รัน region เดียวกับ DB เพื่อลด round-trip ต่อ query
export const preferredRegion = "iad1";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getResultViews } from "@/lib/repository";

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const examSessionId = new URL(request.url).searchParams.get("examSessionId");
  if (!examSessionId) {
    return NextResponse.json({ error: "ไม่พบรอบสอบ" }, { status: 400 });
  }

  const views = await getResultViews(examSessionId);
  return NextResponse.json({ views });
}
