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

function addResultWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  exam: ExamWithSnapshots,
  snapshots: ExportSnapshot[],
) {
  const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, sheetName));
  worksheet.columns = [
    { header: "อันดับ", key: "rank", width: 10 },
    { header: "รหัสนักเรียน", key: "examNo", width: 16 },
    { header: "ชื่อ", key: "name", width: 34 },
    { header: "ห้อง", key: "room", width: 10 },
    ...exam.subjects.map((subject) => ({ header: subject.name, key: subject.id, width: 14 })),
    { header: "คะแนนรวม", key: "totalScore", width: 14 },
    { header: "สถานะ", key: "status", width: 14 },
    { header: "เหตุผล", key: "reason", width: 44 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF7FF" } };

  for (const snapshot of snapshots) {
    const scoreBreakdown = snapshot.scoreBreakdown as Record<string, number>;
    worksheet.addRow({
      rank: snapshot.rank,
      examNo: snapshot.student.examNo,
      name: snapshot.student.name,
      room: snapshot.student.room,
      ...Object.fromEntries(exam.subjects.map((subject) => [subject.id, formatScore(scoreBreakdown[subject.id])])),
      totalScore: formatScore(snapshot.totalScore),
      status: statusLabel(snapshot.status),
      reason: snapshot.reason,
    });
  }

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
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
