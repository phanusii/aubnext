import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

function databaseUrl() {
  // runtime client (serverless): เลือก "pooled" URL ก่อน
  // - POSTGRES_PRISMA_URL = ตัว pooled มาตรฐานของ Vercel Postgres (ผ่าน PgBouncer)
  //   ลด connection storm + reuse connection ได้ดีบน serverless ที่ instance เกิด/ดับบ่อย
  // - ถ้าไม่มี ค่อย fallback DATABASE_URL (กรณีตั้งเอง เช่น Supabase/Neon ที่ใส่ pooled url ตรงนี้)
  // - NON_POOLING ใช้เป็นทางสุดท้าย (เหมาะกับ migration มากกว่า — ดู prisma.config.ts)
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

// ยกระดับความปลอดภัย TLS ของการต่อ Postgres:
// sslmode=verify-ca ตรวจแค่ว่า cert มาจาก CA ที่เชื่อถือ แต่ไม่เช็คชื่อโฮสต์ → เสี่ยง MITM
// (pg-connection-string จะ emit "SECURITY WARNING" ทุก connection) จึงยกเป็น verify-full
// ที่เช็คชื่อโฮสต์ด้วย (Neon รองรับ) — ตั้งทับได้ด้วย PG_SSLMODE หากต้องบังคับค่าอื่น
function hardenSslMode(connectionString: string) {
  const override = process.env.PG_SSLMODE?.trim();
  if (override) {
    return connectionString.replace(/([?&]sslmode=)[^&]+/i, `$1${override}`);
  }
  return connectionString.replace(/([?&]sslmode=)verify-ca\b/i, "$1verify-full");
}

// diagnostic (ชั่วคราว): หาว่า verify-ca ที่ทำให้ SECURITY warning มาจากไหน — โชว์เฉพาะ sslmode ไม่โชว์ credential
function sslmodeOf(s: string) {
  const m = s.match(/[?&]sslmode=([^&]+)/i);
  return m ? m[1] : "(none-in-url)";
}
function usedDbEnvName() {
  if (process.env.POSTGRES_PRISMA_URL) return "POSTGRES_PRISMA_URL";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.POSTGRES_URL) return "POSTGRES_URL";
  if (process.env.POSTGRES_URL_NON_POOLING) return "POSTGRES_URL_NON_POOLING";
  return "(none)";
}

export function getPrisma() {
  if (!prisma) {
    const rawConnectionString = databaseUrl();
    if (!rawConnectionString) {
      throw new Error("ไม่พบตัวแปรฐานข้อมูลใน Vercel: DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL หรือ POSTGRES_URL_NON_POOLING");
    }

    const connectionString = hardenSslMode(rawConnectionString);
    console.info("[db-ssl-diagnostic]", {
      envUsed: usedDbEnvName(),
      rawSslmode: sslmodeOf(rawConnectionString),
      hardenedSslmode: sslmodeOf(connectionString),
      pgsslmodeEnv: process.env.PGSSLMODE ?? "(unset)",
      pgSslmodeOverride: process.env.PG_SSLMODE ?? "(unset)",
      hasChannelBinding: /channel_binding/i.test(rawConnectionString),
    });
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}
