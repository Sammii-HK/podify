import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getDeviceKey } from "@/lib/device-keys";
import { DEVICE_KEY_HEADER, DEVICE_KEY_PATTERN, JOB_ID_PATTERN } from "@/lib/access-routes";
import { getJob } from "@/lib/jobs";

export type JobOwner = { kind: "operator" } | { kind: "device"; fingerprint: string };
export type Principal = { kind: "operator" } | { kind: "device"; key: string; fingerprint: string };
const privateHeaders = { "Cache-Control": "private, no-store" };
export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  return NextResponse.json(body, { ...init, headers });
}
export async function resolvePrincipal(request: Request): Promise<Principal | null> {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) return { kind: "operator" };
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${SESSION_COOKIE}=`));
  if (cookie) {
    try {
      const token = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
      if (await verifySessionToken(token)) return { kind: "operator" };
    } catch { /* Invalid cookie cannot confer access. */ }
  }
  const key = request.headers.get(DEVICE_KEY_HEADER);
  if (!key || !DEVICE_KEY_PATTERN.test(key)) return null;
  let record;
  try { record = await getDeviceKey(key); } catch { return null; }
  if (!record || record.key !== key) return null;
  return { kind: "device", key, fingerprint: createHash("sha256").update(key).digest("hex") };
}
export function jobOwner(principal: Principal): JobOwner {
  return principal.kind === "operator" ? { kind: "operator" } : { kind: "device", fingerprint: principal.fingerprint };
}
export async function requireJob(request: Request, id: string) {
  const principal = await resolvePrincipal(request);
  if (!principal) return { response: privateJson({ error: "Unauthorized" }, { status: 401 }) };
  if (!JOB_ID_PATTERN.test(id)) return { response: privateJson({ error: "Job not found" }, { status: 404 }) };
  let job;
  try { job = await getJob(id); } catch {
    return { response: privateJson({ error: "Job unavailable" }, { status: 503 }) };
  }
  if (!job || (principal.kind !== "operator" &&
      (job.owner?.kind !== "device" || job.owner.fingerprint !== principal.fingerprint))) {
    return { response: privateJson({ error: "Job not found" }, { status: 404 }) };
  }
  return { job, principal };
}
