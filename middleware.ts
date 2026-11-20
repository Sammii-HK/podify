import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { DEVICE_KEY_HEADER, DEVICE_KEY_PATTERN, isDeviceJobPath, isPublicPath } from "@/lib/access-routes";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // API key auth (for programmatic/CLI clients — shared static key, unchanged)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) {
    return NextResponse.next();
  }

  // Session cookie auth (for browser)
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifySessionToken(token) : false;

  if (!valid && isDeviceJobPath(pathname)) {
    const key = request.headers.get(DEVICE_KEY_HEADER);
    if (key && DEVICE_KEY_PATTERN.test(key)) return NextResponse.next();
  }

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"], // The exact classifier decides assets; no favicon-prefix bypass.
};
