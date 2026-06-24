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
    status: "PASSED" | "FAILED" | "REVIEW" | "ABSENT";
    scoreBreakdown: Record<string, number>;
  };
  statistics?: {
    total: {
      maxScore?: number;
      roomRank: number;
      levelRank: number;
      roomCount: number;
      levelCount: number;
    };
    subjects?: Array<{ name: string; maxScore?: number }>;
  };
};

const replyEndpoint = "https://api.line.me/v2/bot/message/reply";
const pushEndpoint = "https://api.line.me/v2/bot/message/push";
const loadingEndpoint = "https://api.line.me/v2/bot/chat/loading/start";

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

// push ข้อความเข้าแชทผู้ใช้โดยตรง (ไม่ต้องมี replyToken) — ใช้หลังผูกบัญชีจาก LIFF เพื่อส่งการ์ดผลคะแนนทันที
export async function pushLineMessage(to: string, messages: LineMessage[]) {
  const token = channelAccessToken();
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const response = await fetch(pushEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE push failed: ${response.status} ${detail}`);
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

  // คนขาดสอบ: การ์ดย่อ แสดงแค่ชื่อ + แถบ "ไม่ได้เข้าสอบ"
  if (result.result.status === "ABSENT") {
    return {
      type: "flex",
      altText: `${result.student.name} — ไม่ได้เข้าสอบ`,
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
            { type: "text", text: result.student.name, size: "lg", color: "#0f172a", weight: "bold", wrap: true, margin: "sm" },
            { type: "text", text: `รหัส ${result.student.examNo} · ${result.student.classLevel}/${result.student.room}`, size: "xs", color: "#64748b" },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#f1f5f9",
              cornerRadius: "12px",
              paddingAll: "14px",
              margin: "md",
              contents: [{ type: "text", text: "ไม่ได้เข้าสอบ", size: "md", weight: "bold", color: "#64748b", align: "center" }],
            },
          ],
        },
      },
    };
  }
  // ไล่สีพื้น (LINE รองรับ linearGradient บน box) — โทนชมพู+ฟ้า
  const gradient = (startColor: string, endColor: string, centerColor?: string) => ({
    type: "linearGradient",
    angle: "135deg",
    startColor,
    endColor,
    ...(centerColor ? { centerColor, centerPosition: "50%" } : {}),
  });

  // พิลล์คะแนนรายวิชา: สลับโทนฟ้า/ชมพู · ชื่อซ้าย เลขขวา (อยู่ในพิลล์เดียวกันจึงดูเป็นชุด) · เลขตัวทึบ
  const subjectPill = (name: string, value: string, tone: "sky" | "pink"): Record<string, unknown> => ({
    type: "box",
    layout: "horizontal",
    flex: 1,
    cornerRadius: "14px",
    paddingAll: "8px",
    background: tone === "sky" ? gradient("#e0f2fe", "#bae6fd") : gradient("#fce7f3", "#fbcfe8"),
    contents: [
      { type: "text", text: name, size: "sm", color: tone === "sky" ? "#075985" : "#9d174d", flex: 1, gravity: "center", wrap: false },
      { type: "text", text: value, size: "sm", weight: "bold", color: tone === "sky" ? "#0369a1" : "#db2777", flex: 0, gravity: "center", align: "end" },
    ],
  });

  // พิลล์อันดับ (พื้นขาวโปร่งบนกล่องไล่สี) · ป้ายกับเลขขนาดเท่ากัน เลขตัวทึบ
  const rankPill = (label: string, value: string, tone: "sky" | "pink"): Record<string, unknown> => ({
    type: "box",
    layout: "horizontal",
    flex: 1,
    cornerRadius: "11px",
    paddingAll: "6px",
    backgroundColor: "#FFFFFFB3",
    contents: [
      { type: "text", text: label, size: "xs", color: tone === "sky" ? "#075985" : "#9d174d", flex: 1, gravity: "center", wrap: false },
      { type: "text", text: value, size: "xs", weight: "bold", color: tone === "sky" ? "#0369a1" : "#db2777", flex: 0, gravity: "center", align: "end" },
    ],
  });

  // แถบสถานะตามผล — พื้นไล่สี (เขียว=ผ่าน, แดง=ไม่ผ่าน, เหลือง=รอตรวจ)
  const statusStyle = {
    PASSED: { bg: gradient("#bbf7d0", "#86efac"), color: "#15803d", text: "✓ ผ่านการคัดเลือก" },
    FAILED: { bg: gradient("#fecaca", "#fca5a5"), color: "#b91c1c", text: "✕ ไม่ผ่านการคัดเลือก" },
    REVIEW: { bg: gradient("#fde68a", "#fcd34d"), color: "#b45309", text: "รอตรวจสอบโดยกรรมการ" },
  }[result.result.status];

  // คะแนนเต็มรายวิชา (จาก statistics ถ้ามี) → แสดงเป็น "คะแนน/เต็ม"
  const maxByName = new Map<string, number>();
  for (const subject of result.statistics?.subjects ?? []) {
    if (subject?.name && typeof subject.maxScore === "number" && subject.maxScore > 0) maxByName.set(subject.name, subject.maxScore);
  }
  const withMax = (subject: string, score: number) => {
    const max = maxByName.get(subject);
    return max ? `${formatScore(score)}/${formatScore(max)}` : formatScore(score);
  };

  // คะแนนรายวิชา 2 คอลัมน์/แถว สลับโทนฟ้า-ชมพู
  const subjectEntries = Object.entries(result.result.scoreBreakdown).slice(0, 8);
  const subjectRows: Record<string, unknown>[] = [];
  for (let i = 0; i < subjectEntries.length; i += 2) {
    const cells: Record<string, unknown>[] = subjectEntries
      .slice(i, i + 2)
      .map(([subject, score], idx) => subjectPill(subject, withMax(subject, score), (i + idx) % 2 === 0 ? "sky" : "pink"));
    const contents = cells.length === 2 ? cells : [cells[0], { type: "filler" }];
    subjectRows.push({ type: "box", layout: "horizontal", margin: "sm", spacing: "md", contents });
  }

  // คะแนนรวม/เต็ม (ถ้ามีคะแนนเต็มรวม)
  const totalMax = result.statistics?.total?.maxScore;
  const totalText = totalMax && totalMax > 0
    ? `${formatScore(result.result.totalScore)}/${formatScore(totalMax)}`
    : formatScore(result.result.totalScore);


  return {
    type: "flex",
    altText: `ผลคะแนนของ ${result.student.name}`,
    contents: {
      type: "bubble",
      // หัวการ์ด: แถบไล่สี ฟ้า→ม่วง→ชมพู ชื่อโรงเรียนตัวขาว + ชื่อรอบสอบ
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "xs",
        background: gradient("#38bdf8", "#f472b6", "#a78bfa"),
        contents: [
          { type: "text", text: `🌸 ${result.school.schoolName} ✨`, size: "sm", color: "#ffffff", weight: "bold", wrap: true },
          { type: "text", text: result.exam.name, size: "xxs", color: "#eef2ff", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        contents: [
          { type: "text", text: result.student.name, size: "lg", color: "#0f172a", weight: "bold", wrap: true },
          { type: "text", text: `รหัส ${result.student.examNo} · ${result.student.classLevel}/${result.student.room}`, size: "xs", color: "#64748b" },
          {
            type: "box",
            layout: "horizontal",
            margin: "sm",
            spacing: "sm",
            alignItems: "center",
            contents: [
              { type: "text", text: "📊 คะแนนรายวิชา", size: "sm", color: "#db2777", weight: "bold", flex: 0 },
              { type: "separator", color: "#f9a8d4" },
            ],
          },
          ...subjectRows,
          // กล่องคะแนนรวม + อันดับ พื้นไล่สี ฟ้า→ม่วง→ชมพู
          {
            type: "box",
            layout: "vertical",
            background: gradient("#dbeafe", "#fce7f3", "#ede9fe"),
            cornerRadius: "16px",
            paddingAll: "10px",
            spacing: "xs",
            margin: "sm",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                alignItems: "center",
                contents: [
                  { type: "text", text: "คะแนนรวม", size: "sm", color: "#0369a1", weight: "bold", flex: 0, gravity: "center" },
                  { type: "text", text: totalText, size: "lg", color: "#db2777", weight: "bold", flex: 0, margin: "md", gravity: "center" },
                  { type: "filler" },
                  { type: "text", text: "🏆", size: "sm", flex: 0, gravity: "center" },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                spacing: "sm",
                contents: [
                  rankPill(
                    "อันดับห้อง",
                    result.statistics ? `${result.statistics.total.roomRank}/${result.statistics.total.roomCount}` : String(result.result.rank),
                    "sky",
                  ),
                  rankPill(
                    "อันดับชั้น",
                    result.statistics ? `${result.statistics.total.levelRank}/${result.statistics.total.levelCount}` : "-",
                    "pink",
                  ),
                ],
              },
            ],
          },
          // แถบสถานะ พื้นไล่สีตามผล
          {
            type: "box",
            layout: "vertical",
            background: statusStyle.bg,
            cornerRadius: "13px",
            paddingAll: "9px",
            margin: "sm",
            contents: [
              { type: "text", text: statusStyle.text, size: "md", weight: "bold", color: statusStyle.color, align: "center", wrap: false },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        contents: [
          // ปุ่มไล่สีชมพู→ฟ้า (ใช้ box + action แทน button เพื่อให้ไล่สีได้)
          {
            type: "box",
            layout: "vertical",
            background: gradient("#f472b6", "#38bdf8"),
            cornerRadius: "13px",
            paddingAll: "10px",
            action: { type: "uri", label: "ดูผลผ่านเว็บเต็ม", uri: webResultUrl },
            contents: [
              { type: "text", text: "🔎 ดูผลผ่านเว็บเต็ม", size: "sm", weight: "bold", color: "#ffffff", align: "center" },
            ],
          },
        ],
      },
    },
  };
}
