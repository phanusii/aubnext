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
    // APP_DATABASE_URL = ตั้งเอง (ไม่ผ่าน Vercel/Neon integration ที่ล็อก env เป็น Sensitive)
    // ใช้ override ปลายทาง DB ได้ เช่น ย้าย DB ไป region อื่น โดยไม่ต้อง disconnect integration
    process.env.APP_DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

// pg-connection-string เตือน SECURITY WARNING ทุก connection เมื่อ sslmode เป็น prefer/require/verify-ca
// เพราะ v ถัดไป (pg v9) จะเปลี่ยนให้ค่าพวกนี้เป็น libpq semantics ที่อ่อนกว่า
// ปัจจุบัน require ถูกตีความเป็น verify-full อยู่แล้ว → ตั้งเป็น verify-full ชัด ๆ:
//   พฤติกรรม TLS เดิมเป๊ะ (verify cert + ชื่อโฮสต์) + ตัด warning + future-proof
// ตั้งทับด้วย env PG_SSLMODE ได้หากต้องบังคับค่าอื่น
function hardenSslMode(connectionString: string) {
  const override = process.env.PG_SSLMODE?.trim();
  if (override) {
    return connectionString.replace(/([?&]sslmode=)[^&]+/i, `$1${override}`);
  }
  return connectionString.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/i, "$1verify-full");
}

export function getPrisma() {
  if (!prisma) {
    const rawConnectionString = databaseUrl();
    if (!rawConnectionString) {
      throw new Error("ไม่พบตัวแปรฐานข้อมูลใน Vercel: APP_DATABASE_URL, DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL หรือ POSTGRES_URL_NON_POOLING");
    }

    // diagnostic ยืนยันแล้วว่า connection string เป็น sslmode=verify-ca → hardenSslMode ยกเป็น verify-full
    // ตัด SECURITY warning ได้จริง (ดู PR #12) จึงถอด diagnostic log ออก
    const connectionString = hardenSslMode(rawConnectionString);
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}
