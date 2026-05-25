import { describe, expect, it } from "vitest";
import { normalizeImportRows, readWorkbookRows, suggestMapping } from "@/lib/excel";
import { normalizeRoomImportRows } from "@/lib/repository";
import { parseDelimitedTable } from "@/lib/table";

describe("excel import helpers", () => {
  it("reads the legacy csv and suggests optional verifier mapping", async () => {
    const csv = [
      "exam_no,student_name,class_level,room,birthdate_or_pin,คณิตศาสตร์,วิทยาศาสตร์",
      "P001,เด็กชายตัวอย่าง หนึ่ง,ม.1,1,01012555,85,78",
    ].join("\n");

    const { headers, rows } = await readWorkbookRows(new TextEncoder().encode(csv).buffer, "scores.csv");
    const mapping = suggestMapping(headers);
    const normalized = normalizeImportRows(rows, mapping);

    expect(mapping.examNo).toBe("exam_no");
    expect(mapping.verifier).toBe("birthdate_or_pin");
    expect(mapping.subjects).toEqual(["คณิตศาสตร์", "วิทยาศาสตร์"]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].scores["คณิตศาสตร์"]).toBe(85);
  });

  it("parses pasted spreadsheet data for room import", () => {
    const table = [
      "exam_no\tstudent_name\tคณิตศาสตร์\tวิทยาศาสตร์",
      "P001\tเด็กชายตัวอย่าง หนึ่ง\t85\t78",
    ].join("\n");

    const parsed = parseDelimitedTable(table);
    const normalized = normalizeRoomImportRows({
      rawRows: parsed.rows,
      subjects: [
        { id: "math", name: "คณิตศาสตร์", maxScore: 100 },
        { id: "science", name: "วิทยาศาสตร์", maxScore: 100 },
      ],
    });

    expect(parsed.headers).toEqual(["exam_no", "student_name", "คณิตศาสตร์", "วิทยาศาสตร์"]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].scores.math).toBe(85);
  });

  it("rejects scores over max score and missing subject columns", () => {
    const normalized = normalizeRoomImportRows({
      rawRows: [{ exam_no: "P001", student_name: "เด็กชายตัวอย่าง", คณิตศาสตร์: "120" }],
      subjects: [
        { id: "math", name: "คณิตศาสตร์", maxScore: 100 },
        { id: "science", name: "วิทยาศาสตร์", maxScore: 100 },
      ],
    });

    expect(normalized.errors.some((error) => error.includes("เกินคะแนนเต็ม"))).toBe(true);
    expect(normalized.errors.some((error) => error.includes("ไม่พบคอลัมน์วิชา วิทยาศาสตร์"))).toBe(true);
  });
});
