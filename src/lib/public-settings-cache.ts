import { cacheLife, cacheTag } from "next/cache";
import { getPublicResultSettings } from "@/lib/repository";

export const publicSettingsCacheTag = "public-result-settings";

export async function getCachedPublicResultSettings() {
  "use cache";
  cacheTag(publicSettingsCacheTag);
  // settings เปลี่ยนน้อย + revalidateTag ล้างทันทีเมื่อแก้ → revalidate 1 ชม. ลด Neon อ่านซ้ำ
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 });
  return getPublicResultSettings();
}
