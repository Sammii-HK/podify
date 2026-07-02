import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { DEVICE_KEY_HEADER } from "@/lib/device-keys";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/",
  "/api/podcast/feed/grimoire", // only the public Grimoire feed
  "/rss/grimoire",              // public RSS alias for Grimoire
  "/the-grimoire-cover.png",    // podcast show artwork (fetched by podcast clients)
  "/_next/",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true;
  // /api/podcast/episodes/{slug}/audio
  if (/^\/api\/podcast\/episodes\/[^/]+\/audio$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // API key auth (for programmatic/CLI clients — shared static key, unchanged)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) {
    return NextResponse.next();
  }

  // Per-device key auth (for mobile app installs). Presence + format is all
  // middleware checks — actual key validity and quota are enforced inside
  // the route handler (see lib/device-keys.ts), since that requires reading
  // Vercel Blob / doing async I/O keyed on the specific record and needs to
  // return a rich 429 payload, not just pass/fail.
  const deviceKey = request.headers.get(DEVICE_KEY_HEADER);
  if (deviceKey && deviceKey.startsWith("dk_")) {
    return NextResponse.next();
  }

  // Session cookie auth (for browser)
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifySessionToken(token) : false;

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
