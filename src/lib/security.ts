import { createHmac, createHash, timingSafeEqual } from "crypto";

const cookieName = "exam_admin";
const studentResultCookie = "student_result_lookup";
const studentResultMaxAgeMs = 30 * 60 * 1000;

function authSecret() {
  return process.env.AUTH_SECRET || "dev-secret-change-me";
}

export function verifierHash(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function signAdminCookie() {
  const issuedAt = Date.now().toString();
  const payload = Buffer.from(JSON.stringify({ role: "admin", issuedAt })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function isValidAdminCookie(value?: string) {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expected = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function adminCookieName() {
  return cookieName;
}

export function studentResultCookieName() {
  return studentResultCookie;
}

export function studentResultCookieMaxAgeSeconds() {
  return Math.floor(studentResultMaxAgeMs / 1000);
}

export function signStudentResultCookie(examNo: string) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ examNo: examNo.trim(), issuedAt })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readStudentResultCookie(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      examNo?: unknown;
      issuedAt?: unknown;
    };
    if (typeof decoded.examNo !== "string" || typeof decoded.issuedAt !== "number") return null;
    if (Date.now() - decoded.issuedAt > studentResultMaxAgeMs) return null;
    return { examNo: decoded.examNo };
  } catch {
    return null;
  }
}
