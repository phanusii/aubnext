import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publishExam } from "@/lib/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await publishExam(id);
  revalidateTag(publicSettingsCacheTag, { expire: 0 });
  return NextResponse.json({ ok: true, ...result });
}
