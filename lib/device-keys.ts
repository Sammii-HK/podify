// ============================================================
// Device API keys — per-install quota-gated auth
// ============================================================
//
// This is a lightweight quota gate for public mobile traffic, NOT a full
// user-accounts system. Each mobile app install registers once via
// POST /api/auth/register-device and receives a device API key. That key
// is sent as `x-device-key` on subsequent /api/podcast/generate calls and
// is rate-limited to a configurable number of generations per day.
//
// Storage mirrors lib/jobs.ts: in-memory Map locally, Vercel Blob in
// production (same BLOB_READ_WRITE_TOKEN already used for jobs/feed/audio).
// No new database is provisioned — see PODIFY_AUTH.md for rationale.

import { put, list } from "@vercel/blob";

export interface DeviceKeyRecord {
  key: string;
  deviceId: string;
  createdAt: number;
  /** Generation timestamps (ms) kept only for the current UTC day, used to enforce the daily quota. */
  usageToday: number[];
  /** UTC day string (YYYY-MM-DD) usageToday's counters apply to. Reset when the day rolls over. */
  usageDay: string;
  /** Lifetime count of successful generations (never reset; for visibility/analytics only). */
  totalGenerations: number;
}

// Configurable daily quota. Defaults to 3 free generations/day per device.
// NOTE: this default is a placeholder — the product owner should confirm the
// real number based on acceptable DeepInfra cost exposure (~$0.03-0.04/episode).
export const DAILY_QUOTA = (() => {
  const raw = process.env.PODIFY_DAILY_DEVICE_QUOTA;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
})();

export const DEVICE_KEY_HEADER = "x-device-key";

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function keyBlobPath(key: string): string {
  return `device-keys/${key}.json`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// In-memory store (local dev + same-invocation cache on Vercel)
// ============================================================

const globalKeys = globalThis as unknown as {
  __podify_device_keys?: Map<string, DeviceKeyRecord>;
};

if (!globalKeys.__podify_device_keys) {
  globalKeys.__podify_device_keys = new Map<string, DeviceKeyRecord>();
}

const deviceKeys = globalKeys.__podify_device_keys;

// ============================================================
// Blob helpers
// ============================================================

async function writeKeyToBlob(record: DeviceKeyRecord): Promise<void> {
  await put(keyBlobPath(record.key), JSON.stringify(record), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readKeyFromBlob(
  key: string
): Promise<DeviceKeyRecord | undefined> {
  try {
    const { blobs } = await list({ prefix: keyBlobPath(key) });
    const blob = blobs.find((b) => b.pathname === keyBlobPath(key));
    if (!blob) return undefined;
    const res = await fetch(blob.url);
    return (await res.json()) as DeviceKeyRecord;
  } catch {
    return undefined;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Register a new device and issue it a unique API key. Idempotent per
 * deviceId is NOT enforced here — callers (register-device route) decide
 * whether to look up an existing key for a deviceId first.
 */
export async function createDeviceKey(deviceId: string): Promise<DeviceKeyRecord> {
  const key = `dk_${crypto.randomUUID().replace(/-/g, "")}`;
  const record: DeviceKeyRecord = {
    key,
    deviceId,
    createdAt: Date.now(),
    usageToday: [],
    usageDay: todayUtc(),
    totalGenerations: 0,
  };
  deviceKeys.set(key, record);
  if (useBlob()) await writeKeyToBlob(record);
  return record;
}

export async function getDeviceKey(
  key: string
): Promise<DeviceKeyRecord | undefined> {
  const local = deviceKeys.get(key);
  if (local) return local;
  if (useBlob()) {
    const fromBlob = await readKeyFromBlob(key);
    if (fromBlob) deviceKeys.set(key, fromBlob);
    return fromBlob;
  }
  return undefined;
}

export interface QuotaCheckResult {
  ok: boolean;
  remaining: number;
  limit: number;
  usedToday: number;
}

/**
 * Atomically-enough (single-region, best-effort) checks whether a device
 * key is under its daily quota and, if so, records the usage immediately.
 * Returns ok:false without mutating state if the quota is exhausted.
 */
export async function checkAndConsumeQuota(
  key: string
): Promise<QuotaCheckResult | null> {
  const record = await getDeviceKey(key);
  if (!record) return null;

  const today = todayUtc();
  if (record.usageDay !== today) {
    record.usageDay = today;
    record.usageToday = [];
  }

  const usedToday = record.usageToday.length;
  if (usedToday >= DAILY_QUOTA) {
    return { ok: false, remaining: 0, limit: DAILY_QUOTA, usedToday };
  }

  record.usageToday.push(Date.now());
  record.totalGenerations += 1;
  deviceKeys.set(key, record);
  if (useBlob()) await writeKeyToBlob(record);

  return {
    ok: true,
    remaining: DAILY_QUOTA - record.usageToday.length,
    limit: DAILY_QUOTA,
    usedToday: record.usageToday.length,
  };
}
