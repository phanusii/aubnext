import { describe, expect, it } from "vitest";
import { prepareRoomImportTable } from "@/lib/room-import-table";

const subjects = [{ name: "คณิตศาสตร์" }, { name: "วิทยาศาสตร์" }];

describe("prepareRoomImportTable — โหมด roster (ไม่บังคับคะแนน)", () => {
  it("วาง 2 คอลัมน์ (รหัส,ชื่อ) ไม่มีหัวตาราง → ได้ student_id/student_name ครบทุกแถว", () => {
    const text = "23253,ธนกฤต\n21482,พัณณิตา";
    const result = prepareRoomImportTable(text, subjects, false);
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ student_id: "23253", student_name: "ธนกฤต" });
    expect(result.rows[1]).toMatchObject({ student_id: "21482", student_name: "พัณณิตา" });
  });

  it("โหมดปกติ (บังคับคะแนน) วาง 4 คอลัมน์ → ได้คะแนนรายวิชา", () => {
    const text = "23253,ธนกฤต,18,26";
    const result = prepareRoomImportTable(text, subjects, true);
    expect(result.rows[0]).toMatchObject({ student_id: "23253", student_name: "ธนกฤต", "คณิตศาสตร์": "18", "วิทยาศาสตร์": "26" });
  });

  it("รองรับหัวตารางในโหมด roster", () => {
    const text = "student_id,student_name\n23253,ธนกฤต";
    const result = prepareRoomImportTable(text, subjects, false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ student_id: "23253", student_name: "ธนกฤต" });
  });
});
