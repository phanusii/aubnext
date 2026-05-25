import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { readWorkbookRows } from "@/lib/excel";
import { importRoomStudents } from "@/lib/repository";

const jsonSchema = z.object({
  rawRows: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; room: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rawRows: Record<string, unknown>[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์" }, { status: 400 });
    }
    rawRows = (await readWorkbookRows(await file.arrayBuffer(), file.name)).rows;
  } else {
    const parsed = jsonSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "ข้อมูลนำเข้าไม่ถูกต้อง" }, { status: 400 });
    }
    rawRows = parsed.data.rawRows;
  }

  const { id, room } = await params;
  try {
    const result = await importRoomStudents({
      examSessionId: id,
      room: decodeURIComponent(room),
      rawRows,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "พบข้อผิดพลาดในข้อมูล", errors: result.errors }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" }, { status: 400 });
  }
}
