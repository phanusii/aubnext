import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const cookieName = "exam_admin";
const studentResultCookie = "student_result_lookup";
const studentResultMaxAgeMs = 30 * 60 * 1000;
// คุกกี้ "ระบุตัวนักเรียน" แบบยาว (เก็บแค่ examNo) — ให้ปุ่มเมนู LINE เปิดหน้าผลตรง ๆ โดยไม่ต้องผ่าน LIFF/กรอกรหัสซ้ำ
const studentIdentityCookie = "student_identity";
const studentIdentityMaxAgeMs = 120 * 24 * 60 * 60 * 1000;

type StudentResultLookup = {
  examNo: string;
  studentId?: string;
  examSessionId?: string;
};

export type LineResultWebLookup = Required<StudentResultLookup> & {
  lineUserId: string;
};

function authSecret() {
  return process.env.AUTH_SECRET || "dev-secret-change-me";
}

export function verifierHash(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

// แฮชรหัสผ่าน admin ด้วย scrypt (built-in Node) — มี salt + ช้าโดยตั้งใจ กัน brute-force/rainbow table
// ใช้เฉพาะรหัสผ่าน admin (ล็อกอินนาน ๆ ครั้ง) ไม่กระทบเส้นทางนักเรียน ที่ยังใช้ verifierHash (examNo ไม่ใช่ความลับ)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  if (!stored) return false;
  try {
    if (stored.startsWith("scrypt$")) {
      const [, n, r, p, saltHex, hashHex] = stored.split("$");
      const expected = Buffer.from(hashHex, "hex");
      const derived = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      });
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    }
    // legacy: sha256 hex (ไม่มี salt) — รองรับรหัสเดิมที่ยังไม่ได้ตั้งใหม่ ให้ล็อกอินได้ไม่สะดุด
    const legacy = Buffer.from(verifierHash(password));
    const expected = Buffer.from(stored);
    return legacy.length === expected.length && timingSafeEqual(legacy, expected);
  } catch {
    return false;
  }
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

export function studentIdentityCookieName() {
  return studentIdentityCookie;
}

export function studentIdentityCookieMaxAgeSeconds() {
  return Math.floor(studentIdentityMaxAgeMs / 1000);
}

// คุกกี้ระบุตัวแบบยาว เก็บแค่ examNo (เซ็น HMAC) — ใช้เปิดหน้าผลตรงจากเมนู LINE โดยไม่ต้องระบุตัวซ้ำ
export function signStudentIdentityCookie(examNo: string) {
  const payload = Buffer.from(JSON.stringify({ examNo: examNo.trim(), issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(`student-identity.${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function readStudentIdentityCookie(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", authSecret()).update(`student-identity.${payload}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      examNo?: unknown;
      issuedAt?: unknown;
    };
    if (typeof decoded.examNo !== "string" || typeof decoded.issuedAt !== "number") return null;
    if (Date.now() - decoded.issuedAt > studentIdentityMaxAgeMs) return null;
    return decoded.examNo;
  } catch {
    return null;
  }
}

export function signStudentResultCookie(lookup: string | StudentResultLookup) {
  const issuedAt = Date.now();
  const normalized = typeof lookup === "string" ? { examNo: lookup.trim() } : {
    examNo: lookup.examNo.trim(),
    studentId: lookup.studentId,
    examSessionId: lookup.examSessionId,
  };
  const payload = Buffer.from(JSON.stringify({ ...normalized, issuedAt })).toString("base64url");
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
      studentId?: unknown;
      examSessionId?: unknown;
      issuedAt?: unknown;
    };
    if (typeof decoded.examNo !== "string" || typeof decoded.issuedAt !== "number") return null;
    if (Date.now() - decoded.issuedAt > studentResultMaxAgeMs) return null;
    return {
      examNo: decoded.examNo,
      studentId: typeof decoded.studentId === "string" ? decoded.studentId : undefined,
      examSessionId: typeof decoded.examSessionId === "string" ? decoded.examSessionId : undefined,
    };
  } catch {
    return null;
  }
}

export function signLineResultWebToken(lookup: LineResultWebLookup) {
  const payload = Buffer.from(JSON.stringify({
    lineUserId: lookup.lineUserId,
    examNo: lookup.examNo.trim(),
    studentId: lookup.studentId,
    examSessionId: lookup.examSessionId,
    issuedAt: Date.now(),
  })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(`line-result.${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function readLineResultWebToken(value?: string | null): LineResultWebLookup | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", authSecret()).update(`line-result.${payload}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      lineUserId?: unknown;
      examNo?: unknown;
      studentId?: unknown;
      examSessionId?: unknown;
    };
    if (
      typeof decoded.lineUserId !== "string" ||
      typeof decoded.examNo !== "string" ||
      typeof decoded.studentId !== "string" ||
      typeof decoded.examSessionId !== "string"
    ) {
      return null;
    }

    return {
      lineUserId: decoded.lineUserId,
      examNo: decoded.examNo,
      studentId: decoded.studentId,
      examSessionId: decoded.examSessionId,
    };
  } catch {
    return null;
  }
}
