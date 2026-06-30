import { School } from "lucide-react";

type LogoPairProps = {
  schoolName: string;
  schoolLogoUrl?: string | null;
  eventLogoUrl?: string | null;
  eventName?: string | null;
  size?: "sm" | "md" | "lg";
  variant?: "overlap" | "side-by-side";
  className?: string;
  light?: boolean;
};

const logoSize = {
  sm: {
    frame: "size-14 p-1.5",
    overlap: "h-16 w-[6.25rem]",
    gap: "gap-2",
    icon: 28,
  },
  md: {
    frame: "size-[4.5rem] p-2",
    overlap: "h-[5.25rem] w-[8.25rem]",
    gap: "gap-2.5",
    icon: 34,
  },
  lg: {
    frame: "size-[5.5rem] p-2.5",
    overlap: "h-[6.25rem] w-[10rem]",
    gap: "gap-3",
    icon: 40,
  },
};

export function LogoPair({
  schoolName,
  schoolLogoUrl,
  eventLogoUrl,
  eventName,
  size = "md",
  variant = "side-by-side",
  className = "",
  light = false,
}: LogoPairProps) {
  const sizing = logoSize[size];
  const hasEventLogo = Boolean(eventLogoUrl);
  const imageRing = light ? "ring-white/80" : "ring-white";
  const fallbackClass = light
    ? "bg-white/20 text-white ring-white/60 backdrop-blur"
    : "bg-white text-[var(--primary-blue-strong)] ring-sky-100";
  const imageFrame = `grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_10px_28px_rgba(15,23,42,0.16)] ring-2 ${imageRing}`;
  const fallbackFrame = `grid shrink-0 place-items-center overflow-hidden rounded-full shadow-[0_10px_28px_rgba(15,23,42,0.14)] ring-2 ${fallbackClass}`;
  const label = hasEventLogo ? "โลโก้โรงเรียนและโลโก้งาน" : "โลโก้โรงเรียน";

  const schoolLogo = (
    <div className={`${schoolLogoUrl ? imageFrame : fallbackFrame} ${sizing.frame}`}>
      {schoolLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={schoolLogoUrl} alt={schoolName} className="size-full object-contain" />
      ) : (
        <School size={sizing.icon} />
      )}
    </div>
  );

  const eventLogo = eventLogoUrl ? (
    <div className={`${imageFrame} ${sizing.frame}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={eventLogoUrl} alt={eventName || "โลโก้งาน"} className="size-full object-contain" />
    </div>
  ) : null;

  if (variant === "side-by-side") {
    return (
      <div className={`flex shrink-0 items-center justify-center ${sizing.gap} ${className}`} aria-label={label}>
        {schoolLogo}
        {eventLogo}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 ${hasEventLogo ? sizing.overlap : sizing.frame} ${className}`}
      aria-label={label}
    >
      <div className={hasEventLogo ? "absolute left-0 top-0" : ""}>{schoolLogo}</div>
      {eventLogo && <div className="absolute bottom-0 right-0">{eventLogo}</div>}
    </div>
  );
}
