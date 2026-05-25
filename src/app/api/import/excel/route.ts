import { NextResponse } from "next/server";
import { normalizeImportRows, readWorkbookRows, suggestMapping } from "@/lib/excel";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const mappingRaw = formData.get("mapping");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "กรุณาเลือกไฟล์ Excel" }, { status: 400 });
  }

  const { headers, rows } = await readWorkbookRows(await file.arrayBuffer(), file.name);
  const mapping = mappingRaw ? JSON.parse(String(mappingRaw)) : suggestMapping(headers);
  const normalized = normalizeImportRows(rows, mapping);

  return NextResponse.json({
    filename: file.name,
    headers,
    mapping,
    previewRows: rows.slice(0, 8),
    rawRows: rows,
    normalizedRows: normalized.rows.slice(0, 8),
    totalRows: rows.length,
    errors: normalized.errors,
  });
}
