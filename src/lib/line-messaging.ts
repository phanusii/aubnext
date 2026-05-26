import { createHmac, timingSafeEqual } from "crypto";

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
        spacing: "md",
        contents: [
          { type: "text", text: "เชื่อมต่อบัญชีก่อน", weight: "bold", size: "lg", color: "#172033" },
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

export function buildResultFlexMessage(result: LineStudentResult) {
  const subjectRows = Object.entries(result.result.scoreBreakdown).slice(0, 6).flatMap(([subject, score]) => [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: subject, size: "sm", color: "#667085", flex: 4, wrap: true },
        { type: "text", text: formatScore(score), size: "sm", color: "#172033", weight: "bold", align: "end", flex: 1 },
      ],
    },
  ]);

  const summaryRows = [
    { label: "คะแนนรวม", value: formatScore(result.result.totalScore) },
    { label: "อันดับห้อง", value: result.statistics ? `${result.statistics.total.roomRank}/${result.statistics.total.roomCount}` : String(result.result.rank) },
    { label: "อันดับทั้งชั้น", value: result.statistics ? `${result.statistics.total.levelRank}/${result.statistics.total.levelCount}` : "-" },
    { label: "สถานะ", value: statusText[result.result.status] },
  ].flatMap((row) => [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: row.label, size: "sm", color: "#667085", flex: 3 },
        { type: "text", text: row.value, size: "sm", color: "#172033", weight: "bold", align: "end", flex: 4, wrap: true },
      ],
    },
  ]);

  const passContents =
    result.result.status === "PASSED" && (result.exam.passTitle || result.exam.passInstructions)
      ? [
          { type: "separator", margin: "md" },
          { type: "text", text: result.exam.passTitle ?? "แจ้งสำหรับผู้ผ่านการคัดเลือก", weight: "bold", size: "sm", color: "#0369a1", wrap: true, margin: "md" },
          ...(result.exam.passInstructions
            ? [{ type: "text", text: result.exam.passInstructions, size: "xs", color: "#667085", wrap: true, margin: "sm" }]
            : []),
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
        spacing: "md",
        contents: [
          { type: "text", text: result.school.schoolName, size: "sm", color: "#0369a1", weight: "bold", wrap: true },
          { type: "text", text: result.exam.name, size: "md", color: "#172033", weight: "bold", wrap: true },
          { type: "separator", margin: "md" },
          { type: "text", text: result.student.name, size: "lg", color: "#172033", weight: "bold", wrap: true, margin: "md" },
          { type: "text", text: `รหัส ${result.student.examNo} · ${result.student.classLevel}/${result.student.room}`, size: "xs", color: "#667085" },
          ...summaryRows,
          { type: "separator", margin: "md" },
          { type: "text", text: "คะแนนรายวิชา", size: "sm", color: "#172033", weight: "bold", margin: "md" },
          ...subjectRows,
          ...passContents,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "เข้าดูบนเว็บไซต์",
              uri: `${baseUrl()}/check-result`,
            },
          },
        ],
      },
    },
  };
}
