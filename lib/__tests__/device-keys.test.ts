import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/blob before importing device-keys
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.test/device-key.json" }),
  list: vi.fn().mockResolvedValue({ blobs: [] }),
}));

describe("device-keys", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset in-memory device key store
    const g = globalThis as unknown as {
      __podify_device_keys?: Map<string, unknown>;
    };
    g.__podify_device_keys = new Map();
    // Ensure blob mode is off for most tests
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.PODIFY_MONTHLY_DEVICE_QUOTA;
  });

  it("createDeviceKey returns a record with a dk_ prefixed key", async () => {
    const { createDeviceKey } = await import("@/lib/device-keys");
    const record = await createDeviceKey("device-abc");

    expect(record.key.startsWith("dk_")).toBe(true);
    expect(record.deviceId).toBe("device-abc");
    expect(record.totalGenerations).toBe(0);
    expect(record.usageThisMonth).toHaveLength(0);
  });

  it("getDeviceKey retrieves a created key", async () => {
    const { createDeviceKey, getDeviceKey } = await import("@/lib/device-keys");
    const record = await createDeviceKey("device-abc");
    const retrieved = await getDeviceKey(record.key);

    expect(retrieved).toBeDefined();
    expect(retrieved!.key).toBe(record.key);
  });

  it("getDeviceKey returns undefined for unknown key", async () => {
    const { getDeviceKey } = await import("@/lib/device-keys");
    const result = await getDeviceKey("dk_nonexistent");
    expect(result).toBeUndefined();
  });

  it("checkAndConsumeQuota returns null for an unknown key", async () => {
    const { checkAndConsumeQuota } = await import("@/lib/device-keys");
    const result = await checkAndConsumeQuota("dk_nonexistent");
    expect(result).toBeNull();
  });

  it("checkAndConsumeQuota allows a generation under the default quota (1/month)", async () => {
    const { createDeviceKey, checkAndConsumeQuota } = await import(
      "@/lib/device-keys"
    );
    const record = await createDeviceKey("device-abc");

    const first = await checkAndConsumeQuota(record.key);
    expect(first!.ok).toBe(true);
    expect(first!.remaining).toBe(0);
  });

  it("checkAndConsumeQuota rejects the 2nd generation once the monthly quota is hit", async () => {
    const { createDeviceKey, checkAndConsumeQuota } = await import(
      "@/lib/device-keys"
    );
    const record = await createDeviceKey("device-abc");

    await checkAndConsumeQuota(record.key);
    const second = await checkAndConsumeQuota(record.key);

    expect(second!.ok).toBe(false);
    expect(second!.remaining).toBe(0);
    expect(second!.limit).toBe(1);
  });

  it("respects PODIFY_MONTHLY_DEVICE_QUOTA env override", async () => {
    process.env.PODIFY_MONTHLY_DEVICE_QUOTA = "3";
    const { createDeviceKey, checkAndConsumeQuota, MONTHLY_QUOTA } =
      await import("@/lib/device-keys");
    expect(MONTHLY_QUOTA).toBe(3);

    const record = await createDeviceKey("device-abc");
    const first = await checkAndConsumeQuota(record.key);
    expect(first!.ok).toBe(true);

    const second = await checkAndConsumeQuota(record.key);
    expect(second!.ok).toBe(true);

    const third = await checkAndConsumeQuota(record.key);
    expect(third!.ok).toBe(true);

    const fourth = await checkAndConsumeQuota(record.key);
    expect(fourth!.ok).toBe(false);
  });

  it("different devices have independent quotas", async () => {
    const { createDeviceKey, checkAndConsumeQuota } = await import(
      "@/lib/device-keys"
    );
    const deviceA = await createDeviceKey("device-a");
    const deviceB = await createDeviceKey("device-b");

    const aFirst = await checkAndConsumeQuota(deviceA.key);
    expect(aFirst!.ok).toBe(true);
    const aExhausted = await checkAndConsumeQuota(deviceA.key);
    expect(aExhausted!.ok).toBe(false);

    const bFirst = await checkAndConsumeQuota(deviceB.key);
    expect(bFirst!.ok).toBe(true);
  });
});
