import { z } from "zod";

export type ImportMapping = {
  examNo: string;
  studentName: string;
  classLevel: string;
  room: string;
  verifier?: string;
  subjects: string[];
};

export type ImportedStudentRow = {
  examNo: string;
  studentName: string;
  classLevel: string;
  room: string;
  verifier: string;
  scores: Record<string, number>;
};

const aliases: Record<keyof Omit<ImportMapping, "subjects">, string[]> = {
  examNo: ["student_id", "รหัสนักเรียน", "exam_no", "เลขประจำตัว", "เลขที่สอบ", "รหัสสอบ"],
  studentName: ["student_name", "ชื่อ", "ชื่อ-สกุล", "ชื่อนักเรียน", "name"],
  classLevel: ["class_level", "ระดับชั้น", "ชั้น", "grade"],
  room: ["room", "ห้อง", "ห้องเรียน", "classroom"],
  verifier: ["birthdate_or_pin", "วันเกิด", "pin", "รหัสยืนยัน", "password"],
};

const requiredKeys = ["examNo", "studentName", "classLevel", "room"] as const;

const importedRowSchema = z.object({
  examNo: z.string().min(1),
  studentName: z.string().min(1),
  classLevel: z.string().min(1),
  room: z.string().min(1),
  verifier: z.string(),
  scores: z.record(z.string(), z.number().min(0)),
});

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function stringifyCell(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function readCsvRows(buffer: ArrayBuffer) {
  const text = new TextDecoder("utf-8").decode(buffer);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0] ?? "").filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return { headers, rows };
}

export async function readWorkbookRows(buffer: ArrayBuffer, filename: string) {
  if (filename.toLowerCase().endsWith(".csv")) {
    return readCsvRows(buffer);
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const fileBuffer = Buffer.from(buffer);

  await workbook.xlsx.load(fileBuffer as never);

  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) return { headers: [] as string[], rows: [] as Record<string, unknown>[] };

  const headerRow = firstSheet.getRow(1);
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values : [];
  const headers = headerValues
    .slice(1)
    .map((value) => stringifyCell(value))
    .filter(Boolean);

  const rows: Record<string, unknown>[] = [];
  firstSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = stringifyCell(row.getCell(index + 1).value);
    });

    if (Object.values(record).some((value) => stringifyCell(value))) {
      rows.push(record);
    }
  });

  return { headers, rows };
}

export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: Partial<ImportMapping> = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  for (const key of [...requiredKeys, "verifier"] as Array<keyof Omit<ImportMapping, "subjects">>) {
    const found = normalizedHeaders.find((header) =>
      aliases[key].some((alias) => header.normalized === normalizeHeader(alias)),
    );
    if (found) mapping[key] = found.original;
  }

  const used = new Set(Object.values(mapping));
  const subjects = headers.filter((header) => !used.has(header));

  return {
    examNo: mapping.examNo ?? "",
    studentName: mapping.studentName ?? "",
    classLevel: mapping.classLevel ?? "",
    room: mapping.room ?? "",
    verifier: mapping.verifier ?? "",
    subjects,
  };
}

export function normalizeImportRows(rows: Record<string, unknown>[], mapping: ImportMapping) {
  const errors: string[] = [];
  const seenExamNos = new Set<string>();

  const missing = requiredKeys.filter((key) => !mapping[key]);
  if (missing.length > 0) {
    errors.push(`ยังไม่ได้จับคู่คอลัมน์: ${missing.join(", ")}`);
  }

  if (mapping.subjects.length === 0) {
    errors.push("ต้องมีคอลัมน์คะแนนอย่างน้อย 1 วิชา");
  }

  const normalized = rows.map((row, index) => {
    const scores: Record<string, number> = {};

    for (const subject of mapping.subjects) {
      const value = Number(row[subject]);
      if (!Number.isFinite(value)) {
        errors.push(`แถว ${index + 2}: คะแนนวิชา ${subject} ไม่ใช่ตัวเลข`);
        scores[subject] = 0;
      } else {
        scores[subject] = value;
      }
    }

    const item = {
      examNo: stringifyCell(row[mapping.examNo]),
      studentName: stringifyCell(row[mapping.studentName]),
      classLevel: stringifyCell(row[mapping.classLevel]),
      room: stringifyCell(row[mapping.room]),
      verifier: mapping.verifier ? stringifyCell(row[mapping.verifier]) : itemExamNo(row, mapping),
      scores,
    };

    const parsed = importedRowSchema.safeParse(item);
    if (!parsed.success) {
      errors.push(`แถว ${index + 2}: ข้อมูลหลักไม่ครบหรือคะแนนไม่ถูกต้อง`);
    }

    if (item.examNo && seenExamNos.has(item.examNo)) {
      errors.push(`แถว ${index + 2}: รหัสนักเรียนซ้ำ (${item.examNo})`);
    }
    seenExamNos.add(item.examNo);

    return item;
  });

  return {
    rows: normalized,
    errors: [...new Set(errors)],
  };
}

function itemExamNo(row: Record<string, unknown>, mapping: ImportMapping) {
  return stringifyCell(row[mapping.examNo]);
}
