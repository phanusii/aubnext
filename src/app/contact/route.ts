import { getCachedPublicResultSettings } from "@/lib/public-settings-cache";
import { normalizeSchoolContact } from "@/lib/school-contact";

export async function GET() {
  const settings = await getCachedPublicResultSettings();
  return new Response(null, {
    status: 302,
    headers: {
      Location: normalizeSchoolContact(settings.schoolContact) ?? "/check-result",
    },
  });
}
