import { SESSION_COOKIE, cookieOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST only (the origin check in proxy.ts stops other sites from logging the owner out).
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return response;
}
