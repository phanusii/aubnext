import { cacheLife, cacheTag } from "next/cache";
import { getPublicResultSettings } from "@/lib/repository";

export const publicSettingsCacheTag = "public-result-settings";

export async function getCachedPublicResultSettings() {
  "use cache";
  cacheTag(publicSettingsCacheTag);
  // เดิม revalidate 300s — รักษา semantics เดิม: serve stale ระหว่าง revalidate, หมดอายุแข็งใน 1 วัน
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  return getPublicResultSettings();
}
