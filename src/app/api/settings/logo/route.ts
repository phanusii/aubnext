import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getSchoolLogoData } from "@/lib/repository";

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

export async function GET() {
  // อ่าน DB ตอน request จริง ไม่ใช่ตอน build (cacheComponents จะ prerender route handler ที่ไม่มี dynamic signal)
  await connection();
  const logoUrl = (await getSchoolLogoData())?.trim();

  if (!logoUrl) return NextResponse.json({ error: "ไม่พบโลโก้" }, { status: 404 });

  if (/^https?:\/\//i.test(logoUrl)) {
    return NextResponse.redirect(logoUrl);
  }

  const dataImage = parseDataImage(logoUrl);
  if (!dataImage) return NextResponse.json({ error: "รูปแบบโลโก้ไม่ถูกต้อง" }, { status: 404 });

  return new NextResponse(dataImage.bytes, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": dataImage.contentType,
    },
  });
}
