import { Suspense } from "react";
import { connection } from "next/server";
import { CheckResultForm } from "@/components/CheckResultForm";
import { PublicBrandingCard, PublicBrandingCardSkeleton } from "@/components/PublicBrandingCard";
import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";

// preferredRegion = iad1 มีผลเฉพาะตอน function รันจริง (revalidate / cache miss) ให้ query ไม่ข้าม region
// ฟอร์ม + หัวข้อ + footer เป็น static shell (prerender + serve จาก CDN) ส่วนการ์ด settings stream เข้ามาทีหลัง
export const preferredRegion = "iad1";

async function SettingsHeader() {
  // เป็น dynamic hole: render ตอน request (เลยไม่ต้องแตะ DB ตอน build) แต่ตัว data อ่านจาก use cache
  // → static shell (ฟอร์ม) serve จาก CDN ทันที ส่วนการ์ด settings stream ตามมาแบบ cached ข้าม request
  await connection();
  const settings = await getCachedPublicResultSettings();
  return (
    <PublicBrandingCard
      settings={{
        schoolName: settings.schoolName,
        logoUrl: settings.logoUrl,
        activeExam: settings.activeExam
          ? {
              name: settings.activeExam.name,
              classLevel: settings.activeExam.classLevel,
              status: settings.activeExam.status,
              eventLogoUrl: settings.activeExam.eventLogoUrl,
              showEventLogo: settings.activeExam.showEventLogo,
            }
          : null,
      }}
    />
  );
}

export default function CheckResultPage() {
  return (
    <CheckResultForm
      header={
        <Suspense fallback={<PublicBrandingCardSkeleton />}>
          <SettingsHeader />
        </Suspense>
      }
    />
  );
}
