// Build script: รัน prisma migrate deploy ก่อน next build เฉพาะเมื่อมี DB env จริง
// - prod (มี env) → apply migration อัตโนมัติก่อน build (ถ้า migration ล้ม build ล้ม → prod คงเวอร์ชันเดิม)
// - preview/ไม่มี DB env → ข้าม migrate (กัน build ล้มเพราะต่อ placeholder ไม่ได้)
import { execSync } from "node:child_process";

const hasDb = Boolean(
  process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL,
);

if (hasDb) {
  console.log("• prisma migrate deploy (พบ DB env)…");
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("• ข้าม prisma migrate deploy (ไม่มี DB env — preview/no-db)");
}
execSync("next build", { stdio: "inherit" });
