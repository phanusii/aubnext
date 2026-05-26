import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { publicStudentResultCacheTag } from "@/lib/public-student-result-cache";
import {
  deleteExamPublishedResults,
  getExamResultSnapshots,
  getPublicResultCacheHealth,
  rebuildPublicResultCache,
} from "@/lib/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const results = await getExamResultSnapshots(id);
  const cacheHealth = await getPublicResultCacheHealth(id);
  return NextResponse.json({ ok: true, results, cacheHealth });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rebuilt = await rebuildPublicResultCache(id);
    const cacheHealth = await getPublicResultCacheHealth(id);
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true, ...rebuilt, cacheHealth });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ซ่อมแคชผลประกาศไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await deleteExamPublishedResults(id);
    revalidateTag(publicSettingsCacheTag, { expire: 0 });
    revalidateTag(publicStudentResultCacheTag, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ลบข้อมูลประกาศผลไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
