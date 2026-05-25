import { cookies } from "next/headers";
import { adminCookieName, isValidAdminCookie } from "@/lib/security";

export async function requireAdmin() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(adminCookieName())?.value;

  if (!isValidAdminCookie(cookie)) {
    return false;
  }

  return true;
}
