import { NextResponse } from "next/server";
import { buildBindPromptMessage, buildResultFlexMessage, hasLineMessagingConfig, replyLineMessage, startLineLoading, verifyLineSignature } from "@/lib/line-messaging";
import { getLineBoundResult } from "@/lib/repository";

type LineWebhookEvent = {
  type: string;
  replyToken?: string;
  source?: {
    userId?: string;
  };
  postback?: {
    data?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

function isCheckResultEvent(event: LineWebhookEvent) {
  if (event.type === "postback") {
    const data = new URLSearchParams(event.postback?.data ?? "");
    return data.get("action") === "check_result";
  }

  if (event.type === "message" && event.message?.type === "text") {
    const text = event.message.text?.trim().toLowerCase() ?? "";
    return ["เช็คผล", "ตรวจผล", "ดูผล", "ผลคะแนน", "check result"].some((keyword) => text.includes(keyword));
  }

  return false;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(body, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { events?: LineWebhookEvent[] };
  const events = payload.events ?? [];

  if (!hasLineMessagingConfig()) {
    console.error("LINE Messaging config is missing");
    return NextResponse.json({ ok: true });
  }

  await Promise.all(
    events.map(async (event) => {
      if (!isCheckResultEvent(event) || !event.replyToken) return;

      const lineUserId = event.source?.userId;
      try {
        if (!lineUserId) {
          await replyLineMessage(event.replyToken, [buildBindPromptMessage("ไม่พบ LINE userId กรุณาเปิดจากบัญชี LINE ส่วนตัว")]);
          return;
        }

        await startLineLoading(lineUserId, 10).catch((error) => {
          console.warn("LINE loading animation failed", error);
        });

        const result = await getLineBoundResult({ lineUserId });
        if (!result.ok) {
          console.info("LINE result lookup needs binding", { lineUserId, error: result.error });
          await replyLineMessage(event.replyToken, [buildBindPromptMessage(result.error)]);
          return;
        }

        await replyLineMessage(event.replyToken, [buildResultFlexMessage(result.result)]);
      } catch (error) {
        console.error("LINE webhook reply failed", error);
      }
    }),
  );

  return NextResponse.json({ ok: true });
}
