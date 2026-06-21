import { defineConfig } from "prisma/config";

// `prisma generate` (รันใน postinstall ตอน build/install) ไม่ต้องต่อ DB จริง
// บน Vercel Preview ที่ยังไม่ได้ตั้ง env → เดิม throw ทำให้ npm install พัง
// จึง fallback เป็น placeholder เพื่อให้ generate ผ่าน
// migration จริง (prisma migrate) ต้องตั้ง env เอง ไม่งั้นจะ connect placeholder ไม่ได้และ error ชัดเจน
const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "postgresql://user:password@localhost:5432/placeholder?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url,
  },
});
