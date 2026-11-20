import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
describe("compatible dependency contracts", () => {
  it("uses the patched PostCSS instance under Next and parses the actual stylesheet", () => {
    const underNext = createRequire(require.resolve("next/package.json"));
    expect(underNext("postcss/package.json").version).toBe("8.5.33");
    const stylesheet = readFileSync("app/globals.css", "utf8");
    const root = underNext("postcss").parse(stylesheet, {
      from: "app/globals.css",
    });
    expect(root.toString()).toContain("--background: #0e1111");
    expect(root.nodes.length).toBeGreaterThan(10);
  });
  it("resolves a patched Zod4 under the actual Blob OIDC config chain without loading account config", () => {
    const blob = createRequire(require.resolve("@vercel/blob"));
    const oidc = createRequire(blob.resolve("@vercel/oidc"));
    const config = createRequire(oidc.resolve("@vercel/cli-config"));
    expect(config("zod/package.json").version).toBe("4.6.7");
    const { z } = config("zod");
    const schema = z.object({
      label: z.string().min(1),
      entries: z.array(z.string()).max(3),
    });
    expect(
      schema.safeParse({ label: "Fixture", entries: ["one", "two"] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        label: "Fixture",
        entries: ["one", "two", "three", "four"],
      }).success,
    ).toBe(false);
  });
  it("keeps the patched build compiler working on a local TypeScript fixture", () => {
    const compiler = require("esbuild");
    expect(compiler.version).toBe("0.28.2");
    expect(
      compiler.transformSync("const fixture: number = 1;", { loader: "ts" })
        .code,
    ).toContain("const fixture = 1");
  });
});
