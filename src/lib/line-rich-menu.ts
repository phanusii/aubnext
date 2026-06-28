function baseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://aubnext.vercel.app";
}

export function getLineLiffUrl(params?: Record<string, string>) {
  const url = new URL(
    process.env.NEXT_PUBLIC_LIFF_ID
      ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`
      : `${baseUrl()}/line`,
  );
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function getLineRichMenuPayload() {
  const siteUrl = baseUrl();

  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "AUBNEXT result rich menu",
    chatBarText: "เมนูเช็คผลสอบ",
    areas: [
      {
        bounds: { x: 55, y: 500, width: 1160, height: 455 },
        action: { type: "uri", label: "กรอกรหัสนักเรียน", uri: getLineLiffUrl() },
      },
      {
        bounds: { x: 1260, y: 500, width: 1185, height: 455 },
        action: { type: "postback", label: "ดูผลคะแนน", data: "action=check_result" },
      },
      {
        // postback → webhook รู้ lineUserId ทันที ตอบการ์ดปุ่มเปิดเว็บ (เร็วกว่าเปิด LIFF แล้วค่อยหา profile)
        bounds: { x: 55, y: 975, width: 1160, height: 455 },
        action: { type: "postback", label: "เช็คผลผ่านเว็บ", data: "action=result_web" },
      },
      {
        bounds: { x: 1260, y: 975, width: 1185, height: 455 },
        action: { type: "uri", label: "ติดต่อสอบถาม", uri: `${siteUrl}/contact` },
      },
    ],
  };
}
