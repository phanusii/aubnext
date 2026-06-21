// debug ชั่วคราว: ดูค่า sslmode จริง (ไม่โชว์ credential) เพื่อหาต้นตอ SECURITY warning — จะลบทิ้งหลังแก้เสร็จ
export const preferredRegion = "sin1";

import { NextResponse } from "next/server";

function sslmodeOf(s: string) {
  const m = s.match(/[?&]sslmode=([^&]+)/i);
  return m ? m[1] : "(none-in-url)";
}

function hardenSslMode(connectionString: string) {
  const override = process.env.PG_SSLMODE?.trim();
  if (override) return connectionString.replace(/([?&]sslmode=)[^&]+/i, `$1${override}`);
  return connectionString.replace(/([?&]sslmode=)verify-ca\b/i, "$1verify-full");
}

export async function GET() {
  const raw =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
  const envUsed = process.env.POSTGRES_PRISMA_URL
    ? "POSTGRES_PRISMA_URL"
    : process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.POSTGRES_URL
        ? "POSTGRES_URL"
        : process.env.POSTGRES_URL_NON_POOLING
          ? "POSTGRES_URL_NON_POOLING"
          : "(none)";
  return NextResponse.json(
    {
      envUsed,
      rawSslmode: sslmodeOf(raw),
      hardenedSslmode: sslmodeOf(hardenSslMode(raw)),
      pgsslmodeEnv: process.env.PGSSLMODE ?? "(unset)",
      pgSslmodeOverride: process.env.PG_SSLMODE ?? "(unset)",
      nodeTlsReject: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "(unset)",
      hasChannelBinding: /channel_binding/i.test(raw),
      hasSslParam: /[?&]ssl=/i.test(raw),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
