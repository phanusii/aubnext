import { describe, expect, it } from "vitest";
import { normalizeImportRows, readWorkbookRows, suggestMapping } from "@/lib/excel";

describe("excel import helpers", () => {
  it("reads the template csv and suggests the expected mapping", async () => {
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
});
