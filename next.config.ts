import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // เปิด Cache Components (PPR) — แยก static shell (serve จาก CDN ทันที) ออกจากส่วน dynamic/cached
  // ส่วนที่อ่าน DB/cookie ต้องอยู่ใน "use cache" หรือ <Suspense> มิฉะนั้น build จะ error (โดยตั้งใจ)
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/:path*.(jpg|jpeg|png|webp|svg|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/exam-template.csv",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
