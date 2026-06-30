import { LogoPair } from "@/components/LogoPair";

export type PublicSettings = {
  schoolName: string;
  logoUrl?: string | null;
  activeExam?: {
    name: string;
    classLevel: string;
    status: "DRAFT" | "PUBLISHED";
    eventLogoUrl?: string | null;
    showEventLogo?: boolean;
  } | null;
};

// การ์ดหัวเรื่อง (โลโก้ + ชื่อโรงเรียน + รอบสอบ) — เป็นส่วนเดียวของหน้า /check-result ที่ต้องอ่าน settings จาก DB
// แยกออกมาเป็น component ของตัวเองเพื่อให้ห่อ <Suspense> ได้ ส่วนที่เหลือของฟอร์มเป็น static shell
export function PublicBrandingCard({ settings }: { settings: PublicSettings }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
      <LogoPair
        schoolName={settings.schoolName}
        schoolLogoUrl={settings.logoUrl}
        eventLogoUrl={settings.activeExam?.showEventLogo ? settings.activeExam.eventLogoUrl : null}
        eventName={settings.activeExam?.name}
        size="md"
        className="mx-auto sm:mx-0"
      />
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-tight text-sky-700 md:text-2xl">{settings.schoolName}</p>
        <h1 className="mt-1 text-lg font-semibold leading-snug text-slate-950 md:text-2xl">
          {settings.activeExam?.name ?? "ประกาศผลสอบ"}
        </h1>
        {settings.activeExam?.classLevel && (
          <p className="mt-2 inline-flex rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 ring-1 ring-pink-100">
            ระดับชั้น {settings.activeExam.classLevel}
          </p>
        )}
      </div>
    </div>
  );
}

// โครงโหลด (skeleton) ของการ์ดหัวเรื่อง — แสดงทันทีใน static shell ระหว่างที่ settings กำลัง stream เข้ามา
export function PublicBrandingCardSkeleton() {
  return (
    <div className="flex items-start gap-3 sm:items-center">
      <div className="size-14 shrink-0 animate-pulse rounded-2xl bg-sky-50 ring-1 ring-sky-100" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-6 w-2/3 animate-pulse rounded-full bg-slate-100" />
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}
