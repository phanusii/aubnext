import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, readStudentResultCookie, signStudentResultCookie, verifyPassword } from "@/lib/security";

describe("student result cookie", () => {
  it("round-trips a signed student lookup", () => {
    const token = signStudentResultCookie(" 21410 ");

    expect(readStudentResultCookie(token)).toEqual({ examNo: "21410" });
  });

  it("round-trips a signed direct result lookup", () => {
    const token = signStudentResultCookie({
      examNo: "21410",
      studentId: "student-1",
      examSessionId: "exam-1",
    });

    expect(readStudentResultCookie(token)).toEqual({
      examNo: "21410",
      studentId: "student-1",
      examSessionId: "exam-1",
    });
  });

  it("rejects tampered tokens", () => {
    const token = signStudentResultCookie("21410");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(readStudentResultCookie(tampered)).toBeNull();
  });
});

describe("admin password hashing", () => {
  it("hashes with scrypt (salted, not the raw value)", () => {
    const stored = hashPassword("s3cret-pass");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("s3cret-pass");
  });

  it("uses a fresh salt each time", () => {
    expect(hashPassword("same")).not.toEqual(hashPassword("same"));
  });

  it("verifies the correct password and rejects the wrong one", () => {
    const stored = hashPassword("correct horse");
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("stays compatible with legacy unsalted sha256 hashes", () => {
    const legacy = createHash("sha256").update("old-pass").digest("hex");
    expect(verifyPassword("old-pass", legacy)).toBe(true);
    expect(verifyPassword("nope", legacy)).toBe(false);
  });

  it("rejects against empty/garbage stored hash", () => {
    expect(verifyPassword("any", "")).toBe(false);
    expect(verifyPassword("any", "scrypt$bad")).toBe(false);
  });
});
