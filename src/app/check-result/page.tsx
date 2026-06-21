import { CheckResultForm } from "@/components/CheckResultForm";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";

// รัน SSR ใน region เดียวกับ Postgres (สิงคโปร์) — กัน cross-region query ตอน settings cache miss
export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export default async function CheckResultPage() {
  const settings = await getCachedPublicResultSettings();

  return (
    <CheckResultForm
      initialSettings={{
        schoolName: settings.schoolName,
        logoUrl: settings.logoUrl,
        activeExam: settings.activeExam
          ? {
              name: settings.activeExam.name,
              classLevel: settings.activeExam.classLevel,
              status: settings.activeExam.status,
            }
          : null,
      }}
    />
  );
}
