import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

function databaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
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
