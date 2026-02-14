import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const expectedUser = process.env.AUTH_USERNAME;
    const expectedPass = process.env.AUTH_PASSWORD;

    if (!expectedUser || !expectedPass) {
      return NextResponse.json(
        { error: "Auth not configured on server" },
        { status: 500 },
      );
    }

    if (username !== expectedUser || password !== expectedPass) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return response;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
