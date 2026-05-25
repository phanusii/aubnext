import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getExamResultSnapshots } from "@/lib/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const results = await getExamResultSnapshots(id);
  return NextResponse.json({ ok: true, results });
}
