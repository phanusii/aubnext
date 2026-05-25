import type { ResultStatus } from "@/lib/types";

export type LineResultCard = {
  schoolName: string;
  examName: string;
  studentName: string;
  examNo: string;
  rank: number;
  totalScore: number;
  status: ResultStatus;
  resultUrl: string;
};

export function lineConfigStatus() {
  const hasToken = Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  const hasSecret = Boolean(process.env.LINE_CHANNEL_SECRET);
  const hasLiffId = Boolean(process.env.NEXT_PUBLIC_LIFF_ID);

  return {
    isReady: hasToken && hasSecret && hasLiffId,
    hasToken,
    hasSecret,
    hasLiffId,
  };
}

export function statusText(status: ResultStatus) {
  if (status === "PASSED") return "ผ่านการคัดเลือก";
  if (status === "REVIEW") return "รอตรวจสอบ";
  return "ไม่ผ่านการคัดเลือก";
}

export function buildLineResultFlex(input: LineResultCard) {
  return {
    type: "flex",
    altText: `${input.examName}: ${statusText(input.status)}`,
    contents: {
      type: "bubble",
      size: "mega",
      hero: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: input.status === "PASSED" ? "#E0F2FE" : "#FFF1F2",
        contents: [
          { type: "text", text: input.schoolName, size: "sm", color: "#0369A1", weight: "bold" },
          { type: "text", text: input.examName, wrap: true, margin: "md", size: "lg", weight: "bold", color: "#172033" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: input.studentName, size: "lg", weight: "bold", color: "#172033" },
          { type: "text", text: `รหัสนักเรียน ${input.examNo}`, size: "sm", color: "#667085" },
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              { type: "text", text: `อันดับ ${input.rank}`, size: "md", weight: "bold", color: "#0369A1" },
              { type: "text", text: `รวม ${input.totalScore}`, size: "md", weight: "bold", color: "#BE185D", align: "end" },
            ],
          },
          {
            type: "text",
            text: statusText(input.status),
            size: "xl",
            weight: "bold",
            color: input.status === "PASSED" ? "#0284C7" : "#BE185D",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0EA5E9",
            action: { type: "uri", label: "ดูผลคะแนน", uri: input.resultUrl },
          },
        ],
      },
    },
  };
}

export async function pushLineMessage(to: string, messages: unknown[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return { ok: false as const, error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN" };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false as const, error: text || `LINE push failed: ${response.status}` };
  }

  return { ok: true as const };
}
