// Edge-safe route classification. Passing middleware is not device authentication.
export const DEVICE_KEY_HEADER = "x-device-key";
export const DEVICE_KEY_PATTERN = /^dk_[a-f0-9]{32}$/;
export const JOB_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const publicPaths = new Set([
  "/login", "/api/auth/login", "/api/auth/logout", "/api/auth/register-device",
  "/api/podcast/feed/grimoire", "/rss/grimoire", "/the-grimoire-cover.png",
  "/api/library", "/favicon.ico", "/icon.svg",
]);
export function isPublicPath(path: string): boolean {
  return publicPaths.has(path) || path.startsWith("/_next/") ||
    /^\/api\/podcast\/episodes\/[^/]+\/audio$/.test(path);
}
export function isDeviceJobPath(path: string): boolean {
  return path === "/api/podcast/generate" ||
    /^\/api\/podcast\/(?:status|process)\/[^/]+$/.test(path) ||
    /^\/api\/podcast\/[^/]+\/audio$/.test(path);
}
