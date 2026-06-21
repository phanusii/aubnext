import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ระบบประกาศผลสอบ",
  description: "Exam result announcement and private result checking system",
};

// วาง dynamic page (เช่น /check-result, /line) ใน region เดียวกับ Postgres (สิงคโปร์)
export const preferredRegion = "sin1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* วัด Core Web Vitals (LCP/INP/CLS) จากผู้ใช้จริง — เปิดดูได้ที่แท็บ Speed Insights ใน Vercel */}
        <SpeedInsights />
      </body>
    </html>
  );
}
