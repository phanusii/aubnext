import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type ExportStatus = "all" | "passed" | "failed";
type ExportLayout = "rooms" | "single";

function formatScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  return Number.isInteger(score) ? score : Number(score.toFixed(2));
}

function statusLabel(status: string) {
  if (status === "PASSED") return "ผ่าน";
  if (status === "REVIEW") return "รอตรวจ";
  return "ไม่ผ่าน";
}

function safeSheetName(room: string) {
  const name = `ห้อง ${room}`.replace(/[\\/*?:[\]]/g, " ").trim();
  return name.slice(0, 31) || "ผลคะแนน";
}

function uniqueSheetName(workbook: ExcelJS.Workbook, baseName: string) {
  const safeName = baseName.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "ผลคะแนน";
  if (!workbook.getWorksheet(safeName)) return safeName;

  let index = 2;
  while (index < 100) {
    const suffix = ` ${index}`;
    const name = `${safeName.slice(0, 31 - suffix.length)}${suffix}`;
    if (!workbook.getWorksheet(name)) return name;
    index += 1;
  }
  return safeName.slice(0, 28) + " 99";
}

function exportStatusFromParam(value: string | null): ExportStatus {
  if (value === "passed" || value === "failed") return value;
  return "all";
}

function exportLayoutFromParam(value: string | null): ExportLayout {
  return value === "single" ? "single" : "rooms";
}

function statusWhere(status: ExportStatus) {
  if (status === "passed") return "PASSED" as const;
  if (status === "failed") return "FAILED" as const;
  return undefined;
}

function exportGroupLabel(status: ExportStatus) {
  if (status === "passed") return "ผู้ผ่านเข้ารอบ";
  if (status === "failed") return "ผู้ไม่ผ่านเข้ารอบ";
  return "ทั้งหมด";
}

function exportLayoutLabel(layout: ExportLayout) {
  return layout === "single" ? "ชีตเดียวทุกห้อง" : "แยกห้อง";
}

type ExamWithSnapshots = NonNullable<Awaited<ReturnType<typeof loadExamForExport>>>;
type ExportSnapshot = ExamWithSnapshots["resultSnapshots"][number];

async function loadExamForExport(id: string, status: ExportStatus) {
  const prisma = getPrisma();
  return prisma.examSession.findUnique({
    where: { id },
    include: {
      subjects: { orderBy: { sortOrder: "asc" } },
      resultSnapshots: {
        where: statusWhere(status) ? { status: statusWhere(status) } : undefined,
        include: { student: true },
        orderBy: [
          { student: { room: "asc" } },
          { rank: "asc" },
          { student: { examNo: "asc" } },
        ],
      },
    },
  });
}

const EXPORT_FONT = "Tahoma";

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
  return { top: side, left: side, bottom: side, right: side };
}

function statusFont(status: string) {
  if (status === "PASSED") return { name: EXPORT_FONT, size: 11, bold: true, color: { argb: "FF15803D" } };
  if (status === "FAILED") return { name: EXPORT_FONT, size: 11, color: { argb: "FFB91C1C" } };
  return { name: EXPORT_FONT, size: 11, color: { argb: "FFB45309" } };
}

function addResultWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  exam: ExamWithSnapshots,
  snapshots: ExportSnapshot[],
) {
  const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, sheetName));
  const columns = [
    { header: "อันดับ", key: "rank", width: 9 },
    { header: "รหัสนักเรียน", key: "examNo", width: 16 },
    { header: "ชื่อ - สกุล", key: "name", width: 32 },
    { header: "ห้อง", key: "room", width: 9 },
    ...exam.subjects.map((subject) => ({ header: subject.name, key: subject.id, width: 13 })),
    { header: "คะแนนรวม", key: "totalScore", width: 13 },
    { header: "สถานะ", key: "status", width: 12 },
    { header: "เหตุผล", key: "reason", width: 40 },
  ];
  // ตั้ง key+width อย่างเดียว (ไม่ใส่ header อัตโนมัติ) เพื่อเว้นแถวบนไว้ทำหัวรายงานเอง
  worksheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));
  const lastCol = columns.length;
  const leftAlignKeys = new Set(["name", "reason"]);

  // หัวรายงาน: ชื่อรอบสอบ + บริบท (ห้อง/ระดับชั้น/วันที่พิมพ์)
  worksheet.mergeCells(1, 1, 1, lastCol);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = exam.name;
  titleCell.font = { name: EXPORT_FONT, size: 16, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 26;

  worksheet.mergeCells(2, 1, 2, lastCol);
  const subtitleCell = worksheet.getCell(2, 1);
  const printedAt = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  subtitleCell.value = `${sheetName} · ระดับชั้น ${exam.classLevel} · พิมพ์เมื่อ ${printedAt}`;
  subtitleCell.font = { name: EXPORT_FONT, size: 10, color: { argb: "FF64748B" } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(2).height = 18;

  // หัวตาราง (แถว 3) — พื้นฟ้า ตัวขาว หนา จัดกึ่งกลาง
  const HEADER_ROW = 3;
  const headerRow = worksheet.getRow(HEADER_ROW);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: EXPORT_FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0EA5E9" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 22;

  // ข้อมูล — เส้นขอบบาง จัดชิด (ชื่อ/เหตุผลซ้าย, อื่นกึ่งกลาง) เน้นคะแนนรวม + สีสถานะ
  const totalCol = columns.findIndex((column) => column.key === "totalScore") + 1;
  const statusCol = columns.findIndex((column) => column.key === "status") + 1;
  for (const snapshot of snapshots) {
    const scoreBreakdown = snapshot.scoreBreakdown as Record<string, number>;
    const row = worksheet.addRow({
      rank: snapshot.rank,
      examNo: snapshot.student.examNo,
      name: snapshot.student.name,
      room: snapshot.student.room,
      ...Object.fromEntries(exam.subjects.map((subject) => [subject.id, formatScore(scoreBreakdown[subject.id])])),
      totalScore: formatScore(snapshot.totalScore),
      status: statusLabel(snapshot.status),
      reason: snapshot.reason,
    });
    row.height = 18;
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.font = { name: EXPORT_FONT, size: 11 };
      cell.border = thinBorder();
      cell.alignment = {
        vertical: "middle",
        horizontal: leftAlignKeys.has(column.key) ? "left" : "center",
        wrapText: column.key === "reason",
      };
    });
    row.getCell(totalCol).font = { name: EXPORT_FONT, size: 11, bold: true };
    row.getCell(statusCol).font = statusFont(snapshot.status);
  }

  worksheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  worksheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: lastCol },
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const status = exportStatusFromParam(url.searchParams.get("status"));
  const layout = exportLayoutFromParam(url.searchParams.get("layout"));
  const exam = await loadExamForExport(id, status);

  if (!exam) {
    return NextResponse.json({ error: "ไม่พบรอบสอบ" }, { status: 404 });
  }
  if (exam.resultSnapshots.length === 0) {
    return NextResponse.json({ error: `ยังไม่มีผลคะแนน${exportGroupLabel(status)}สำหรับดาวน์โหลด` }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AUBNEXT";
  workbook.created = new Date();

  if (layout === "single") {
    addResultWorksheet(workbook, "ทุกห้อง", exam, exam.resultSnapshots);
  } else {
    const grouped = new Map<string, typeof exam.resultSnapshots>();
    for (const snapshot of exam.resultSnapshots) {
      grouped.set(snapshot.student.room, [...(grouped.get(snapshot.student.room) ?? []), snapshot]);
    }

    for (const [room, snapshots] of grouped) {
      addResultWorksheet(workbook, safeSheetName(room), exam, snapshots);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${exam.name}-${exportGroupLabel(status)}-${exportLayoutLabel(layout)}.xlsx`);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
