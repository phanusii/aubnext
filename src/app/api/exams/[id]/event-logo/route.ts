export const preferredRegion = "iad1";

import { connection, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const exam = await getPrisma().examSession.findUnique({
    where: { id },
    select: { eventLogoUrl: true, showEventLogo: true, updatedAt: true },
  });

  const logoUrl = exam?.showEventLogo ? exam.eventLogoUrl?.trim() : "";
  if (!logoUrl) return NextResponse.json({ error: "ไม่พบโลโก้งาน" }, { status: 404 });

  if (/^https?:\/\//i.test(logoUrl)) {
    return NextResponse.redirect(logoUrl);
  }

  const dataImage = parseDataImage(logoUrl);
  if (!dataImage) return NextResponse.json({ error: "รูปแบบโลโก้งานไม่ถูกต้อง" }, { status: 404 });

  return new NextResponse(dataImage.bytes, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": dataImage.contentType,
      "Last-Modified": exam?.updatedAt?.toUTCString() ?? new Date().toUTCString(),
    },
  });
}
