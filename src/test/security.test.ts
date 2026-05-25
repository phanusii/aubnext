import { describe, expect, it } from "vitest";
import { readStudentResultCookie, signStudentResultCookie } from "@/lib/security";

describe("student result cookie", () => {
  it("round-trips a signed student lookup", () => {
    const token = signStudentResultCookie(" 21410 ");

    expect(readStudentResultCookie(token)).toEqual({ examNo: "21410" });
  });

  it("rejects tampered tokens", () => {
    const token = signStudentResultCookie("21410");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(readStudentResultCookie(tampered)).toBeNull();
  });
});
