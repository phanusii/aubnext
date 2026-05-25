import { unstable_cache } from "next/cache";
import { getPublicResultSettings } from "@/lib/repository";

export const publicSettingsCacheTag = "public-result-settings";

export const getCachedPublicResultSettings = unstable_cache(
  async () => getPublicResultSettings(),
  ["public-result-settings"],
  {
    tags: [publicSettingsCacheTag],
    revalidate: 300,
  },
);
