const encoder = new TextEncoder();

export const SESSION_COOKIE = "podify_session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is not set");
  return encoder.encode(secret);
}

async function getKey(): Promise<CryptoKey> {
  const secret = getSecret();
  return crypto.subtle.importKey(
    "raw",
    secret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionToken(): Promise<string> {
  const payload = {
    user: process.env.AUTH_USERNAME ?? "admin",
    exp: Date.now() + COOKIE_OPTIONS.maxAge * 1000,
  };
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const payloadB64 = toBase64Url(payloadBytes.buffer as ArrayBuffer);
  const key = await getKey();
  const signData = encoder.encode(payloadB64);
  const signature = await crypto.subtle.sign("HMAC", key, signData.buffer as ArrayBuffer);
  const signatureB64 = toBase64Url(signature);
  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return false;

    const key = await getKey();
    const sigBytes = fromBase64Url(signatureB64);
    const dataBytes = encoder.encode(payloadB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer as ArrayBuffer,
      dataBytes.buffer as ArrayBuffer,
    );
    if (!valid) return false;

    const decoded = fromBase64Url(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(decoded));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}
