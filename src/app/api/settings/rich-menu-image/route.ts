import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getSchoolRichMenuImageData } from "@/lib/repository";

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

// เสิร์ฟรูป Rich Menu (base64 ใน DB) แยกจาก getSchoolSettings เพื่อไม่ให้ดึงก้อน ~1.1MB ในเส้นทางอ่านทั่วไป
// CDN cache 1 ชม. → Neon โดนอ่านแค่ตอน cache miss (แทบไม่กระทบ egress)
export async function GET() {
  await connection();
  const imageUrl = (await getSchoolRichMenuImageData())?.trim();
  if (!imageUrl) return NextResponse.json({ error: "ไม่พบรูป Rich Menu" }, { status: 404 });

  if (/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.redirect(imageUrl);
  }

  const dataImage = parseDataImage(imageUrl);
  if (!dataImage) return NextResponse.json({ error: "รูปแบบรูปไม่ถูกต้อง" }, { status: 404 });

  return new NextResponse(dataImage.bytes, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": dataImage.contentType,
    },
  });
}
