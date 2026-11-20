import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "fixture-session",
  verifySessionToken: vi.fn().mockResolvedValue(false),
}));
import { middleware } from "../../middleware";
describe("the generated brand asset", () => {
  it("is available without exposing protected data or icon-prefix lookalikes", async () => {
    const icon = await middleware(
      new NextRequest("https://example.test/icon.svg"),
    );
    expect(icon.headers.get("x-middleware-next")).toBe("1");
    for (const pathname of ["/feed", "/icon.svg-private"]) {
      const response = await middleware(
        new NextRequest("https://example.test" + pathname),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://example.test/login",
      );
    }
    for (const pathname of [
      "/api/podcast/generate",
      "/api/podcast/status/fixture",
    ]) {
      const response = await middleware(
        new NextRequest("https://example.test" + pathname),
      );
      expect(response.status).toBe(401);
    }
  });
});
