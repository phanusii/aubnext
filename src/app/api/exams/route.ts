import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createExamSession } from "@/lib/repository";

const createSchema = z.object({
  name: z.string().min(1),
  classLevel: z.string().min(1),
  selectionMode: z.enum(["PER_ROOM", "WHOLE_LEVEL"]),
  wholeLevelQuota: z.number().int().nonnegative().optional().nullable(),
  rooms: z.array(z.object({ room: z.string().min(1), quota: z.number().int().nonnegative() })).default([]),
});

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

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลรอบสอบไม่ถูกต้อง", issues: parsed.error.flatten() }, { status: 400 });
  }

  const prisma = getPrisma();
  const input = {
    ...parsed.data,
    name: parsed.data.name.trim(),
    classLevel: parsed.data.classLevel.trim(),
  };
  const duplicate = await prisma.examSession.findFirst({
    where: {
      name: input.name,
      classLevel: input.classLevel,
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "มีรอบสอบชื่อนี้ในชั้นนี้แล้ว" }, { status: 409 });
  }

  const exam = await createExamSession(input);
  return NextResponse.json({ ok: true, exam });
}
