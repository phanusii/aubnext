import { createHmac, createHash, timingSafeEqual } from "crypto";

const cookieName = "exam_admin";

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
