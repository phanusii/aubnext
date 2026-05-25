import { parseDelimitedRows, parseDelimitedTable } from "@/lib/table";

export type RoomImportSubject = {
  name: string;
};

export type PreparedRoomImportTable = {
  headers: string[];
  rows: Record<string, unknown>[];
  firstDataRowNumber: number;
  hasHeader: boolean;
};

const studentIdAliases = ["student_id", "รหัสนักเรียน", "exam_no", "เลขประจำตัว", "เลขที่สอบ", "รหัสสอบ"];
const studentNameAliases = ["student_name", "ชื่อนักเรียน", "ชื่อ-สกุล", "ชื่อ", "name"];

export function prepareRoomImportTable(text: string, subjects: RoomImportSubject[]): PreparedRoomImportTable {
  const activeSubjects = subjects.filter((subject) => subject.name.trim());
  const rawRows = parseDelimitedRows(text);

  if (rawRows.length === 0) {
    return { headers: [], rows: [], firstDataRowNumber: 2, hasHeader: true };
  }

  const firstRow = rawRows[0];
  const expectedHeaderlessColumns = activeSubjects.length + 2;
  const firstRowLooksLikeHeader = firstRow.some((cell) => {
    const normalized = normalizeColumnName(cell);
    return (
      studentIdAliases.some((alias) => normalizeColumnName(alias) === normalized) ||
      studentNameAliases.some((alias) => normalizeColumnName(alias) === normalized) ||
      activeSubjects.some((subject) => normalizeColumnName(subject.name) === normalized)
    );
  });

  if (!firstRowLooksLikeHeader && activeSubjects.length > 0 && firstRow.length === expectedHeaderlessColumns) {
    const headers = ["student_id", "student_name", ...activeSubjects.map((subject) => subject.name)];
    return {
      headers,
      rows: rawRows.map((row) => toRecord(headers, row)),
      firstDataRowNumber: 1,
      hasHeader: false,
    };
  }

  const parsed = parseDelimitedTable(text);
  return {
    ...parsed,
    firstDataRowNumber: 2,
    hasHeader: true,
  };
}

function normalizeColumnName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function toRecord(headers: string[], values: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}
