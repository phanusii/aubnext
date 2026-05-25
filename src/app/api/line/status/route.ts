import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLineNotificationStats } from "@/lib/repository";

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const examSessionId = url.searchParams.get("examSessionId") || undefined;
  const status = await getLineNotificationStats(examSessionId);
  return NextResponse.json(status);
}
