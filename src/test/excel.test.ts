import { describe, expect, it } from "vitest";
import { normalizeImportRows, readWorkbookRows, suggestMapping } from "@/lib/excel";
import { normalizeRoomImportRows } from "@/lib/repository";
import { prepareRoomImportTable } from "@/lib/room-import-table";
import { parseDelimitedTable } from "@/lib/table";

describe("excel import helpers", () => {
  it("reads the csv and suggests optional verifier mapping", async () => {
    const csv = [
      "student_id,student_name,class_level,room,birthdate_or_pin,คณิตศาสตร์,วิทยาศาสตร์",
      "65001,เด็กชายตัวอย่าง หนึ่ง,ม.1,1,01012555,85,78",
    ].join("\n");

    const { headers, rows } = await readWorkbookRows(new TextEncoder().encode(csv).buffer, "scores.csv");
    const mapping = suggestMapping(headers);
    const normalized = normalizeImportRows(rows, mapping);

    expect(mapping.examNo).toBe("student_id");
    expect(mapping.verifier).toBe("birthdate_or_pin");
    expect(mapping.subjects).toEqual(["คณิตศาสตร์", "วิทยาศาสตร์"]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].scores["คณิตศาสตร์"]).toBe(85);
  });

  it("still accepts legacy exam_no columns", async () => {
    const csv = [
      "exam_no,student_name,class_level,room,คณิตศาสตร์",
      "P001,เด็กชายตัวอย่าง หนึ่ง,ม.1,1,85",
    ].join("\n");

    const { headers, rows } = await readWorkbookRows(new TextEncoder().encode(csv).buffer, "scores.csv");
    const mapping = suggestMapping(headers);
    const normalized = normalizeImportRows(rows, mapping);

    expect(mapping.examNo).toBe("exam_no");
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].examNo).toBe("P001");
  });

  it("parses pasted spreadsheet data for room import", () => {
    const table = [
      "student_id\tstudent_name\tคณิตศาสตร์\tวิทยาศาสตร์",
      "65001\tเด็กชายตัวอย่าง หนึ่ง\t85\t78",
    ].join("\n");

    const parsed = parseDelimitedTable(table);
    const normalized = normalizeRoomImportRows({
      rawRows: parsed.rows,
      subjects: [
        { id: "math", name: "คณิตศาสตร์", maxScore: 100 },
        { id: "science", name: "วิทยาศาสตร์", maxScore: 100 },
      ],
    });

    expect(parsed.headers).toEqual(["student_id", "student_name", "คณิตศาสตร์", "วิทยาศาสตร์"]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].scores.math).toBe(85);
  });

  it("prepares headerless pasted room import rows from configured subject order", () => {
    const table = [
      "21283\tเด็กชายทีปกร หมื่นพัน\t26\t15",
      "21284\tเด็กชายธนธัส รุ่งโรจน์\t27\t10",
    ].join("\n");

    const prepared = prepareRoomImportTable(table, [
      { name: "วิทยาศาสตร์" },
      { name: "คณิตศาสตร์" },
    ]);
    const normalized = normalizeRoomImportRows({
      rawRows: prepared.rows,
      subjects: [
        { id: "science", name: "วิทยาศาสตร์", maxScore: 30 },
        { id: "math", name: "คณิตศาสตร์", maxScore: 20 },
      ],
    });

    expect(prepared.hasHeader).toBe(false);
    expect(prepared.firstDataRowNumber).toBe(1);
    expect(prepared.headers).toEqual(["student_id", "student_name", "วิทยาศาสตร์", "คณิตศาสตร์"]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].examNo).toBe("21283");
    expect(normalized.rows[0].scores.science).toBe(26);
    expect(normalized.rows[0].scores.math).toBe(15);
  });

  it("rejects scores over max score and missing subject columns", () => {
    const normalized = normalizeRoomImportRows({
      rawRows: [{ student_id: "65001", student_name: "เด็กชายตัวอย่าง", คณิตศาสตร์: "120" }],
      subjects: [
        { id: "math", name: "คณิตศาสตร์", maxScore: 100 },
        { id: "science", name: "วิทยาศาสตร์", maxScore: 100 },
      ],
    });

    expect(normalized.errors.some((error) => error.includes("เกินคะแนนเต็ม"))).toBe(true);
    expect(normalized.errors.some((error) => error.includes("ไม่พบคอลัมน์วิชา วิทยาศาสตร์"))).toBe(true);
  });
});
