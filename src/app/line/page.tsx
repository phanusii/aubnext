import { LinePortal } from "@/components/LinePortal";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";

export const dynamic = "force-dynamic";

export default async function LinePage() {
  const settings = await getCachedPublicResultSettings();

  return (
    <LinePortal
      schoolName={settings.schoolName}
      logoUrl={settings.logoUrl}
      activeExam={settings.activeExam
        ? {
            name: settings.activeExam.name,
            classLevel: settings.activeExam.classLevel,
            status: settings.activeExam.status,
          }
        : null}
    />
  );
}
