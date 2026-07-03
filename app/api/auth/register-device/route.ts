import { NextRequest, NextResponse } from "next/server";
import { createDeviceKey, MONTHLY_QUOTA } from "@/lib/device-keys";

interface RegisterDeviceRequest {
  deviceId?: string;
}

/**
 * Public endpoint (see middleware.ts PUBLIC_PATHS) — a mobile app calls this
 * once on first launch to obtain a per-install API key. No login/password
 * required; this is a quota-gated issuance, not an account system.
 */
export async function POST(request: NextRequest) {
  let body: RegisterDeviceRequest;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const deviceId =
    typeof body.deviceId === "string" && body.deviceId.trim().length > 0
      ? body.deviceId.trim().slice(0, 200)
      : crypto.randomUUID();

  const record = await createDeviceKey(deviceId);

  return NextResponse.json({
    deviceKey: record.key,
    deviceId: record.deviceId,
    monthlyQuota: MONTHLY_QUOTA,
  });
}
