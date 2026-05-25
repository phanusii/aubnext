import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeImportRows } from "@/lib/excel";
import { requireAdmin } from "@/lib/auth";
import { importExam } from "@/lib/repository";

const schema = z.object({
  examName: z.string().min(1),
  classLevel: z.string().min(1),
  selectionMode: z.enum(["PER_ROOM", "WHOLE_LEVEL"]),
  wholeLevelQuota: z.number().int().nonnegative().optional().nullable(),
  roomQuotas: z.record(z.string(), z.number().int().nonnegative()).optional(),
  tieBreakSubjects: z.array(z.string()).default([]),
  filename: z.string().default("uploaded.xlsx"),
  mapping: z.object({
    examNo: z.string().min(1),
    studentName: z.string().min(1),
    classLevel: z.string().min(1),
    room: z.string().min(1),
    verifier: z.string().optional(),
    subjects: z.array(z.string()).min(1),
  }),
  rawRows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลนำเข้าไม่ถูกต้อง", issues: parsed.error.flatten() }, { status: 400 });
  }

  const normalized = normalizeImportRows(parsed.data.rawRows, parsed.data.mapping);
  if (normalized.errors.length > 0) {
    return NextResponse.json({ error: "พบข้อผิดพลาดในไฟล์", errors: normalized.errors }, { status: 400 });
  }

  const exam = await importExam({
    ...parsed.data,
    rows: normalized.rows,
  });

  return NextResponse.json({ ok: true, exam });
}
