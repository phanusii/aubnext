import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getLineRichMenuPayload } from "@/lib/line-rich-menu";
import { getSchoolRichMenuImageData, getSchoolSettings, upsertSchoolSettings } from "@/lib/repository";

// nodejs เป็น runtime default อยู่แล้ว (cacheComponents เลิกรองรับ `export const runtime`)

function lineToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
}

const imageSchema = z.object({
  imageUrl: z.string().max(1_400_000, "รูป Rich Menu ใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 1MB").optional().nullable(),
});

function parseDataImage(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  const normalizedContentType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > 1_000_000) {
    throw new Error("รูป Rich Menu ต้องไม่เกิน 1MB หลัง resize");
  }
  return { contentType: normalizedContentType, bytes };
}

async function lineFetch(path: string, init: RequestInit & { dataHost?: boolean } = {}) {
  const token = lineToken();
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  const { dataHost, ...requestInit } = init;

  const response = await fetch(`${dataHost ? "https://api-data.line.me" : "https://api.line.me"}${path}`, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(requestInit.headers ?? {}),
    },
  });
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`LINE API error ${response.status}: ${body}`);
  }
  return body ? JSON.parse(body) : {};
}

export async function GET() {
  const hasImage = Boolean(await getSchoolRichMenuImageData());
  return NextResponse.json({
    image: hasImage ? "/api/settings/rich-menu-image" : "/line-rich-menu.jpg",
    payload: getLineRichMenuPayload(),
  });
}

async function getRichMenuImage(inputImageUrl?: string | null) {
  const imageUrl = inputImageUrl !== undefined ? inputImageUrl : await getSchoolRichMenuImageData();
  if (imageUrl) {
    const parsed = parseDataImage(imageUrl);
    if (!parsed) throw new Error("รูป Rich Menu ไม่ถูกต้อง กรุณาอัปโหลดรูปใหม่");
    return parsed;
  }

  return {
    contentType: "image/jpeg",
    bytes: await readFile(join(process.cwd(), "public", "line-rich-menu.jpg")),
  };
}

async function updateLineRichMenu(inputImageUrl?: string | null) {
  const payload = getLineRichMenuPayload();
  if (payload.areas.length !== 4) throw new Error("ตั้งค่าพื้นที่ Rich Menu ไม่ครบ 4 ปุ่ม");
  const existing = await lineFetch("/v2/bot/richmenu/list") as { richmenus?: Array<{ richMenuId: string; name: string }> };
  await Promise.all(
    (existing.richmenus ?? [])
      .filter((menu) => menu.name === payload.name)
      .map((menu) => lineFetch(`/v2/bot/richmenu/${menu.richMenuId}`, { method: "DELETE" })),
  );

  const created = await lineFetch("/v2/bot/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }) as { richMenuId: string };

  const image = await getRichMenuImage(inputImageUrl);
  await lineFetch(`/v2/bot/richmenu/${created.richMenuId}/content`, {
    method: "POST",
    dataHost: true,
    headers: { "Content-Type": image.contentType },
    body: new Uint8Array(image.bytes),
  });
  await lineFetch(`/v2/bot/user/all/richmenu/${created.richMenuId}`, { method: "POST" });

  if (inputImageUrl !== undefined) {
    // อัปเดตเฉพาะรูป Rich Menu — field อื่นเป็น undefined = Prisma ไม่แตะ (กันทับ logoUrl ที่ตอนนี้เป็น pointer)
    const settings = await getSchoolSettings();
    await upsertSchoolSettings({
      schoolName: settings.schoolName,
      lineRichMenuImageUrl: inputImageUrl || null,
    });
  }

  return created.richMenuId;
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = imageSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message;
      return NextResponse.json({ error: issue ?? "ข้อมูลรูป Rich Menu ไม่ถูกต้อง" }, { status: 400 });
    }
    const richMenuId = await updateLineRichMenu(parsed.data.imageUrl);
    return NextResponse.json({ ok: true, richMenuId });
  } catch (error) {
    console.error("Update LINE rich menu failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "อัปเดต Rich Menu ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
