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

export function getPrisma() {
  if (!prisma) {
    const connectionString = databaseUrl();
    if (!connectionString) {
      throw new Error("ไม่พบตัวแปรฐานข้อมูลใน Vercel: DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL หรือ POSTGRES_URL_NON_POOLING");
    }

    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}
