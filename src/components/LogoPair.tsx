import { School } from "lucide-react";

type LogoPairProps = {
  schoolName: string;
  schoolLogoUrl?: string | null;
  eventLogoUrl?: string | null;
  eventName?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  light?: boolean;
};

const sizeClass = {
  sm: "size-14 rounded-2xl",
  md: "size-20 rounded-3xl",
  lg: "size-24 rounded-[1.75rem]",
};

const iconSize = {
  sm: 30,
  md: 38,
  lg: 44,
};

export function LogoPair({
  schoolName,
  schoolLogoUrl,
  eventLogoUrl,
  eventName,
  size = "md",
  className = "",
  light = false,
}: LogoPairProps) {
  const frame = sizeClass[size];
  const icon = iconSize[size];
  const hasEventLogo = Boolean(eventLogoUrl);
  const ringClass = light ? "ring-white/60" : "ring-sky-100";
  const fallbackClass = light ? "bg-white/25 text-white ring-white/50 backdrop-blur" : "bg-white text-[var(--primary-blue-strong)] ring-sky-100";

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} aria-label={hasEventLogo ? "โลโก้โรงเรียนและโลโก้งาน" : "โลโก้โรงเรียน"}>
      <div className={`${frame} grid shrink-0 place-items-center overflow-hidden shadow-sm ring-2 ${schoolLogoUrl ? ringClass : fallbackClass}`}>
        {schoolLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={schoolLogoUrl} alt={schoolName} className="size-full object-cover" />
        ) : (
          <School size={icon} />
        )}
      </div>
      {eventLogoUrl && (
        <div className={`${frame} grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm ring-2 ${ringClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={eventLogoUrl} alt={eventName || "โลโก้งาน"} className="size-full object-cover" />
        </div>
      )}
    </div>
  );
}
