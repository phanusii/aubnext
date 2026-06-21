// รัน function ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ต่อ query
export const preferredRegion = "sin1";

import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";
import { normalizeSchoolContact } from "@/lib/school-contact";

export async function GET() {
  const settings = await getCachedPublicResultSettings();
  return new Response(null, {
    status: 302,
    headers: {
      Location: normalizeSchoolContact(settings.schoolContact) ?? "/check-result",
    },
  });
}
