import { createHmac, timingSafeEqual } from "crypto";
import { signLineResultWebToken } from "@/lib/security";
import type { LineResultWebLookup } from "@/lib/security";

type LineMessage = Record<string, unknown>;
type LineStudentResult = {
  school: { schoolName: string };
  exam: {
    name: string;
    classLevel: string;
    selectionMode: "PER_ROOM" | "WHOLE_LEVEL";
    passTitle?: string | null;
    passInstructions?: string | null;
  };
  student: { examNo: string; name: string; classLevel: string; room: string };
  result: {
    rank: number;
    totalScore: number;
    status: "PASSED" | "FAILED" | "REVIEW";
    scoreBreakdown: Record<string, number>;
  };
  statistics?: {
    total: {
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    };
  };
};

const replyEndpoint = "https://api.line.me/v2/bot/message/reply";
const loadingEndpoint = "https://api.line.me/v2/bot/chat/loading/start";

const statusText = {
  PASSED: "ผ่านการคัดเลือก",
  FAILED: "ไม่ผ่านการคัดเลือก",
  REVIEW: "รอตรวจสอบโดยกรรมการ",
};

function channelSecret() {
  return process.env.LINE_CHANNEL_SECRET || "";
}

function channelAccessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
}

export function hasLineMessagingConfig() {
  return Boolean(channelSecret() && channelAccessToken());
}

export function verifyLineSignature(body: string, signature?: string | null) {
  const secret = channelSecret();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function replyLineMessage(replyToken: string, messages: LineMessage[]) {
  const token = channelAccessToken();
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const response = await fetch(replyEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE reply failed: ${response.status} ${detail}`);
  }
}

export async function startLineLoading(chatId: string, loadingSeconds = 10) {
  const token = channelAccessToken();
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const response = await fetch(loadingEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chatId, loadingSeconds }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE loading animation failed: ${response.status} ${detail}`);
  }
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://aubnext.vercel.app";
}

function liffUrl() {
  return process.env.NEXT_PUBLIC_LIFF_ID ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}` : `${baseUrl()}/line`;
}

export function buildBindPromptMessage(error?: string) {
  return {
    type: "flex",
    altText: "กรุณาเชื่อมต่อบัญชี LINE กับรหัสนักเรียน",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "เชื่อมต่อบัญชี LINE", weight: "bold", size: "lg", color: "#172033" },
          {
            type: "text",
            text: error ?? "กรุณาผูกบัญชี LINE กับรหัสนักเรียนก่อน แล้วกดเช็คผลอีกครั้ง",
            wrap: true,
            size: "sm",
            color: "#667085",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0ea5e9",
            action: {
              type: "uri",
              label: "เชื่อมต่อบัญชี",
              uri: liffUrl(),
            },
          },
        ],
      },
    },
  };
}

export function buildResultFlexMessage(result: LineStudentResult, webLookup?: LineResultWebLookup) {
  const webResultUrl = webLookup
    ? `${baseUrl()}/line/result-web?token=${encodeURIComponent(signLineResultWebToken(webLookup))}`
    : `${baseUrl()}/check-result`;
  const subjectRows = Object.entries(result.result.scoreBreakdown).slice(0, 8).flatMap(([subject, score]) => [
    {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        { type: "text", text: subject, size: "sm", color: "#64748b", flex: 4, wrap: true },
        { type: "text", text: formatScore(score), size: "sm", color: "#0f172a", weight: "bold", align: "end", flex: 1 },
      ],
    },
  ]);

  const passContents =
    result.result.status === "PASSED"
      ? [
          { type: "separator", margin: "sm" },
          { type: "text", text: result.exam.passTitle || "ผ่านการคัดเลือก", weight: "bold", size: "sm", color: "#0369a1", wrap: true, margin: "sm" },
          {
            type: "text",
            text: result.exam.passInstructions || "กรุณาติดตามรายละเอียดและขั้นตอนถัดไปจากประกาศของโรงเรียน",
            size: "xs",
            color: "#64748b",
            wrap: true,
            margin: "xs",
          },
        ]
      : [];

  return {
    type: "flex",
    altText: `ผลคะแนนของ ${result.student.name}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          { type: "text", text: result.school.schoolName, size: "sm", color: "#0369a1", weight: "bold", wrap: true },
          { type: "text", text: result.exam.name, size: "sm", color: "#64748b", wrap: true },
          { type: "separator", margin: "sm" },
          { type: "text", text: result.student.name, size: "xl", color: "#0f172a", weight: "bold", wrap: true, margin: "sm" },
          { type: "text", text: `รหัส ${result.student.examNo} · ${result.student.classLevel}/${result.student.room}`, size: "xs", color: "#64748b" },
          { type: "text", text: "คะแนนรายวิชา", size: "sm", color: "#0f172a", weight: "bold", margin: "sm" },
          ...subjectRows,
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f0f9ff",
            cornerRadius: "16px",
            paddingAll: "12px",
            spacing: "xs",
            margin: "sm",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "คะแนนรวม", size: "sm", color: "#0369a1", flex: 3 },
                  { type: "text", text: formatScore(result.result.totalScore), size: "xxl", color: "#0f172a", weight: "bold", align: "end", flex: 3 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "อันดับห้อง", size: "xs", color: "#64748b", flex: 3 },
                  { type: "text", text: result.statistics ? `${result.statistics.total.roomRank}/${result.statistics.total.roomCount}` : String(result.result.rank), size: "xs", color: "#0f172a", weight: "bold", align: "end", flex: 2 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "อันดับทั้งชั้น", size: "xs", color: "#64748b", flex: 3 },
                  { type: "text", text: result.statistics ? `${result.statistics.total.levelRank}/${result.statistics.total.levelCount}` : "-", size: "xs", color: "#0f172a", weight: "bold", align: "end", flex: 2 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "สถานะ", size: "xs", color: "#64748b", flex: 3 },
                  { type: "text", text: statusText[result.result.status], size: "xs", color: result.result.status === "PASSED" ? "#0369a1" : "#64748b", weight: "bold", align: "end", flex: 4, wrap: true },
                ],
              },
            ],
          },
          ...passContents,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "uri",
              label: "ดูผลผ่านเว็บเต็ม",
              uri: webResultUrl,
            },
          },
        ],
      },
    },
  };
}
