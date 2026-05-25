import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const exams = await prisma.examSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { students: true, resultSnapshots: true } },
      roomQuotas: { orderBy: { room: "asc" } },
      subjects: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(exams);
}
