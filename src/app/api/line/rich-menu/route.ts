import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/auth";
import { getLineRichMenuPayload } from "@/lib/line-rich-menu";

export const runtime = "nodejs";

function lineToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
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
  return NextResponse.json({
    image: "/line-rich-menu.jpg",
    payload: getLineRichMenuPayload(),
  });
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = getLineRichMenuPayload();
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

    const image = await readFile(join(process.cwd(), "public", "line-rich-menu.jpg"));
    await lineFetch(`/v2/bot/richmenu/${created.richMenuId}/content`, {
      method: "POST",
      dataHost: true,
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(image),
    });
    await lineFetch(`/v2/bot/user/all/richmenu/${created.richMenuId}`, { method: "POST" });

    return NextResponse.json({ ok: true, richMenuId: created.richMenuId });
  } catch (error) {
    console.error("Update LINE rich menu failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "อัปเดต Rich Menu ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
