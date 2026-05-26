import { unstable_cache } from "next/cache";
import { getPublicResultSettings } from "@/lib/repository";

export const publicSettingsCacheTag = "public-result-settings";

export const getCachedPublicResultSettings = unstable_cache(
  async () => getPublicResultSettings(),
  ["public-result-settings-v2"],
  {
    tags: [publicSettingsCacheTag],
    revalidate: 300,
  },
);
