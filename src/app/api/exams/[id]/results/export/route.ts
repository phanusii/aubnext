import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const exam = await prisma.examSession.findUnique({
    where: { id },
    include: {
      subjects: { orderBy: { sortOrder: "asc" } },
      resultSnapshots: {
        include: { student: true },
        orderBy: [
          { student: { room: "asc" } },
          { rank: "asc" },
          { student: { examNo: "asc" } },
        ],
      },
    },
  });

  if (!exam) {
    return NextResponse.json({ error: "ไม่พบรอบสอบ" }, { status: 404 });
  }
  if (exam.resultSnapshots.length === 0) {
    return NextResponse.json({ error: "ยังไม่มีผลคะแนนสำหรับดาวน์โหลด" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AUBNEXT";
  workbook.created = new Date();

  const grouped = new Map<string, typeof exam.resultSnapshots>();
  for (const snapshot of exam.resultSnapshots) {
    grouped.set(snapshot.student.room, [...(grouped.get(snapshot.student.room) ?? []), snapshot]);
  }

  for (const [room, snapshots] of grouped) {
    const worksheet = workbook.addWorksheet(safeSheetName(room));
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

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${exam.name}-ผลคะแนน.xlsx`);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
