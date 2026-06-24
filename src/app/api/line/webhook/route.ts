// รัน function ใน region เดียวกับ Postgres (สิงคโปร์) — ลด round-trip ต่อ query ของปุ่มเช็คผล LINE
export const preferredRegion = "sin1";

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

function createLineWebhookTrace() {
  const startedAt = Date.now();
  const marks: Array<Record<string, unknown>> = [];
  let previousAt = startedAt;

  return {
    mark(label: string, extra: Record<string, unknown> = {}) {
      const now = Date.now();
      marks.push({
        label,
        elapsedMs: now - startedAt,
        deltaMs: now - previousAt,
        ...extra,
      });
      previousAt = now;
    },
    done(outcome: string, extra: Record<string, unknown> = {}) {
      if (process.env.RESULT_LOOKUP_DEBUG !== "1") return;
      console.info("[line-webhook]", {
        outcome,
        totalMs: Date.now() - startedAt,
        region: process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_REGION || "local",
        marks,
        ...extra,
      });
    },
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const trace = createLineWebhookTrace();
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  trace.mark("read_body");

  if (!verifyLineSignature(body, signature)) {
    trace.done("invalid_signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  trace.mark("verify_signature");

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
      const eventTrace = createLineWebhookTrace();
      try {
        if (!lineUserId) {
          await replyLineMessage(event.replyToken, [buildBindPromptMessage("ไม่พบ LINE userId กรุณาเปิดจากบัญชี LINE ส่วนตัว")]);
          eventTrace.done("missing_user_id");
          return;
        }

        eventTrace.mark("start_loading");
        const loadingPromise = startLineLoading(lineUserId, 5).catch((error) => {
          console.warn("LINE loading animation failed", error);
        });
        const resultPromise = getLineBoundResult({ lineUserId });

        await Promise.race([loadingPromise, wait(250)]);
        const result = await resultPromise;
        eventTrace.mark("result_lookup", { ok: result.ok });
        if (!result.ok) {
          console.info("LINE result lookup needs binding", { lineUserId, error: result.error });
          await replyLineMessage(event.replyToken, [buildBindPromptMessage(result.error)]);
          eventTrace.done("reply_bind_prompt");
          return;
        }

        await replyLineMessage(event.replyToken, [buildResultFlexMessage(result.result, result.lookup)]);
        eventTrace.done("reply_result");
      } catch (error) {
        console.error("LINE webhook reply failed", error);
        eventTrace.done("reply_failed");
      }
    }),
  );

  trace.done("ok", { events: events.length });
  return NextResponse.json({ ok: true });
}
