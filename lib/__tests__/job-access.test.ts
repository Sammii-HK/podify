import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  key: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), capacity: vi.fn(),
  quota: vi.fn(), session: vi.fn(), pipeline: vi.fn(), manifest: vi.fn(), read: vi.fn(),
  fetchContent: vi.fn(),
}));
vi.mock("dotenv/config", () => ({}));
vi.mock("@/lib/auth", () => ({ SESSION_COOKIE: "fixture-session", verifySessionToken: mocks.session }));
vi.mock("@/lib/device-keys", () => ({ getDeviceKey: mocks.key, checkAndConsumeQuota: mocks.quota }));
vi.mock("@/lib/jobs", () => ({ getJob: mocks.get, createJob: mocks.create, updateJob: mocks.update, isAtCapacity: mocks.capacity }));
vi.mock("@/lib/pipeline", () => ({ generateEpisode: mocks.pipeline }));
vi.mock("@/lib/fetch-content", () => ({ fetchUrl: mocks.fetchContent, fetchGrimoirePage: mocks.fetchContent }));
vi.mock("@/lib/feed", () => ({ readManifest: mocks.manifest }));
vi.mock("fs/promises", () => ({ readFile: mocks.read }));
import { resolvePrincipal, jobOwner } from "@/lib/job-access";
import { middleware } from "../../middleware";
import { isPublicPath } from "@/lib/access-routes";
import { POST as generate } from "../../app/api/podcast/generate/route";
import { POST as processJob } from "../../app/api/podcast/process/[jobId]/route";
import { GET as status } from "../../app/api/podcast/status/[jobId]/route";
import { GET as audio } from "../../app/api/podcast/[jobId]/audio/route";
import { GET as fullFeed } from "../../app/api/podcast/feed/route";
const a = "dk_" + "a".repeat(32), b = "dk_" + "b".repeat(32);
const id = "12345678-1234-4123-8123-123456789abc";
const params = { params: Promise.resolve({ jobId: id }) };
function request(path: string, key?: string, extra: Record<string, string> = {}, body?: unknown) {
  return new Request("https://example.test" + path, { method: body ? "POST" : "GET", headers: { ...(key ? { "x-device-key": key } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function owner(key = a) { return jobOwner((await resolvePrincipal(request("/", key)))!); }
function job(ownership?: unknown) {
  return { id, status: "pending", progress: 0, stage: null, message: "Queued", createdAt: 0,
    ...(ownership ? { owner: ownership } : {}), config: { content: "private-source-do-not-return" } };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_KEY", "fixture-operator");
  vi.stubEnv("WINDMILL_WEBHOOK_URL", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in auth mocks"); }));
  mocks.key.mockImplementation(async key => [a,b].includes(key) ? { key, deviceId: "same-untrusted-client-id" } : undefined);
  mocks.session.mockImplementation(async token => token === "valid-fixture");
  mocks.capacity.mockResolvedValue(false);
  mocks.quota.mockResolvedValue({ ok: true, limit: 1, remaining: 0 });
  mocks.create.mockResolvedValue({ id });
  mocks.update.mockResolvedValue(undefined);
  mocks.pipeline.mockResolvedValue({ slug: "fixture", audioPath: "fixture.mp3", transcript: [], durationSeconds: 60, wordCount: 1, costUsd: 0 });
  mocks.get.mockResolvedValue(undefined);
});
describe("exact middleware route boundary", () => {
  it("preserves existing public contracts and rejects lookalike prefixes", async () => {
    for (const path of ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/register-device", "/api/podcast/feed/grimoire", "/rss/grimoire", "/api/library", "/api/podcast/episodes/any-manifest-slug/audio", "/icon.svg", "/the-grimoire-cover.png", "/_next/static/chunk.js"]) {
      expect(isPublicPath(path)).toBe(true);
      expect((await middleware(new NextRequest("https://example.test"+path))).headers.get("x-middleware-next")).toBe("1");
    }
    for (const path of ["/login-private", "/api/auth/future", "/api/library-private", "/api/podcast/feed/grimoire-private", "/rss/grimoire-private", "/api/podcast/feed", "/feed"]) expect(isPublicPath(path)).toBe(false);
  });
  it("delegates only issued-shaped device job routes, not arbitrary pages or feeds", async () => {
    for (const path of ["/api/podcast/generate", `/api/podcast/status/${id}`, `/api/podcast/process/${id}`, `/api/podcast/${id}/audio`]) {
      expect((await middleware(new NextRequest("https://example.test"+path, { headers: { "x-device-key": a } }))).headers.get("x-middleware-next")).toBe("1");
      expect((await middleware(new NextRequest("https://example.test"+path, { headers: { "x-device-key": "dk_prefix-only" } }))).status).toBe(401);
    }
    for (const path of ["/feed", "/api/podcast/feed", "/api/private-future"]) expect((await middleware(new NextRequest("https://example.test"+path, { headers: { "x-device-key": a } }))).headers.get("x-middleware-next")).toBeNull();
  });
});
describe("server principal and job ownership", () => {
  it("validates issued records and fingerprints keys instead of trusting deviceId", async () => {
    expect(await resolvePrincipal(request("/", "dk_prefix-only"))).toBeNull();
    expect(mocks.key).not.toHaveBeenCalled();
    expect(await resolvePrincipal(request("/", "dk_"+"c".repeat(32)))).toBeNull();
    expect(await owner(a)).not.toEqual(await owner(b));
    expect(JSON.stringify(await owner(a))).not.toContain(a);
    mocks.key.mockResolvedValue({ key: b });
    expect(await resolvePrincipal(request("/", a))).toBeNull();
  });
  it("retains operator API key and valid session precedence", async () => {
    expect(await resolvePrincipal(request("/", a, { "x-api-key": "fixture-operator" }))).toEqual({ kind: "operator" });
    expect(await resolvePrincipal(request("/", a, { cookie: "other=x; fixture-session=valid-fixture" }))).toEqual({ kind: "operator" });
    expect(mocks.key).not.toHaveBeenCalled();
  });
  it("stops unauthenticated job routes before reading storage or processing", async () => {
    for (const handler of [status, processJob, audio]) {
      const response = await handler(request("/", "dk_prefix-only"), params);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.pipeline).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before job reads", async () => {
    expect((await status(request("/", a), { params: Promise.resolve({ jobId: "../private" }) })).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("treats missing, foreign and ownerless legacy jobs identically for devices", async () => {
    const otherOwner = await owner(b);
    for (const record of [undefined, job(otherOwner), job()]) {
      mocks.get.mockResolvedValue(record);
      for (const handler of [status, processJob, audio]) {
        const response = await handler(request("/", a), params);
        expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "Job not found" });
      }
    }
    expect(mocks.pipeline).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("fails closed without leaking storage exceptions", async () => {
    mocks.key.mockRejectedValueOnce(new Error("private-key-storage-detail"));
    expect(await resolvePrincipal(request("/", a))).toBeNull();
    mocks.get.mockRejectedValueOnce(new Error("private-job-storage-detail"));
    const response = await status(request("/", a), params);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("private-job-storage-detail");
  });
  it("allows own status without returning ownership, bearer keys or source config", async () => {
    mocks.get.mockResolvedValue(job(await owner()));
    const response = await status(request("/", a), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).not.toMatch(/fingerprint|owner|private-source-do-not-return/); expect(text).not.toContain(a);
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("allows operators to inspect legacy jobs", async () => {
    mocks.get.mockResolvedValue(job());
    expect((await status(request("/", undefined, { "x-api-key": "fixture-operator" }), params)).status).toBe(200);
    expect((await status(request("/", undefined, { cookie: "fixture-session=valid-fixture" }), params)).status).toBe(200);
  });
  it("processes an admitted own job without consuming generation quota", async () => {
    mocks.get.mockResolvedValue(job(await owner()));
    expect((await processJob(request("/", a), params)).status).toBe(200);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1); expect(mocks.quota).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue({ ...job(await owner()), status: "processing" });
    expect((await processJob(request("/", a), params)).status).toBe(409);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
  });
  it("guards private audio and retains no-store on successful bytes", async () => {
    mocks.get.mockResolvedValue({ ...job(await owner()), status: "complete", result: { audioPath: "fixture.mp3" } });
    mocks.read.mockResolvedValue(Buffer.from("mock audio bytes"));
    const response = await audio(request("/", a), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith("fixture.mp3");
  });
});
describe("generation and full RSS", () => {
  const brief = { content: "A synthetic source used only by mocked generation route tests. ".repeat(2), async: true };
  it("authenticates before capacity, quota or source retrieval", async () => {
    expect((await generate(request("/", "dk_prefix-only", {}, brief))).status).toBe(401);
    expect(mocks.capacity).not.toHaveBeenCalled(); expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.fetchContent).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("assigns server ownership and consumes device admission quota once", async () => {
    const response = await generate(request("/", a, {}, { ...brief, owner: { kind: "operator" } }));
    expect(response.status).toBe(200); expect(mocks.quota).toHaveBeenCalledExactlyOnceWith(a);
    expect(mocks.create).toHaveBeenCalledWith(await owner());
    expect(await response.json()).toEqual({ jobId: id });
  });
  it("keeps quota rejection and capacity semantics, without creating a job", async () => {
    mocks.quota.mockResolvedValue({ ok: false, limit: 1, remaining: 0 });
    expect((await generate(request("/", a, {}, brief))).status).toBe(429); expect(mocks.create).not.toHaveBeenCalled();
    mocks.quota.mockClear(); mocks.capacity.mockResolvedValue(true);
    expect((await generate(request("/", a, {}, brief))).status).toBe(429); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("does not expose exception details from quota or source admission", async () => {
    mocks.quota.mockRejectedValueOnce(new Error("private-key-or-config-detail"));
    const response = await generate(request("/", a, {}, brief));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("private-key-or-config-detail");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps operator generation unmetered despite a supplied device header", async () => {
    expect((await generate(request("/", a, { "x-api-key": "fixture-operator" }, brief))).status).toBe(200);
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledWith({ kind: "operator" });
  });
  it("guards all-episode RSS before manifest access and makes operator RSS private", async () => {
    expect((await fullFeed(request("/", a))).status).toBe(401); expect(mocks.manifest).not.toHaveBeenCalled();
    mocks.manifest.mockResolvedValue({ show: { title: "Fixture", description: "Fixture", link: "https://example.test", language: "en", author: "Fixture", email: "fixture@example.test", imageUrl: "https://example.test/cover.png", category: "Technology" }, episodes: [] });
    const response = await fullFeed(request("/", undefined, { "x-api-key": "fixture-operator" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
