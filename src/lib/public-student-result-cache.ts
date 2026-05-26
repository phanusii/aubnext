import { unstable_cache } from "next/cache";
import { publicSettingsCacheTag } from "@/lib/public-settings-cache";
import { findPublishedStudentResultSession } from "@/lib/repository";

export const publicStudentResultCacheTag = "public-student-results";

export const getCachedPublishedStudentResultSession = unstable_cache(
  async (examNo: string) => findPublishedStudentResultSession({ examNo }),
  ["public-student-result-session"],
  {
    tags: [publicStudentResultCacheTag, publicSettingsCacheTag],
    revalidate: 300,
  },
);
