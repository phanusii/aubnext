import { NextResponse } from "next/server";
import { verifyLineResultWebLookup } from "@/lib/repository";
import {
  readLineResultWebToken,
  signStudentResultCookie,
  studentResultCookieMaxAgeSeconds,
  studentResultCookieName,
} from "@/lib/security";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const signedLookup = readLineResultWebToken(token);
  const lookup = signedLookup ? await verifyLineResultWebLookup(signedLookup) : null;

  if (!lookup) {
    return NextResponse.redirect(new URL("/check-result", request.url));
  }

  const resultUrl = new URL("/check-result/result", request.url);
  resultUrl.searchParams.set("lineResultToken", token ?? "");
  const response = NextResponse.redirect(resultUrl);
  response.cookies.set(studentResultCookieName(), signStudentResultCookie(lookup), {
    httpOnly: true,
    maxAge: studentResultCookieMaxAgeSeconds(),
    path: "/check-result",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
