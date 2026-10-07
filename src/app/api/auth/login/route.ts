import { NextResponse, type NextRequest } from "next/server";
import {
  FLOW_COOKIE,
  FLOW_SECONDS,
  authConfig,
  codeChallenge,
  cookieOptions,
  randomToken,
  redirectUri,
  sign,
} from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Starts the Google sign-in: state + PKCE + nonce are kept in a short-lived signed cookie.
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const config = authConfig();
  if (config.missing.length)
    return NextResponse.redirect(new URL("/login?error=config", `http://${host}`));
  const state = randomToken();
  const verifier = randomToken(48);
  const nonce = randomToken();
  const flow = await sign(
    { state, verifier, nonce, host, exp: Math.floor(Date.now() / 1000) + FLOW_SECONDS },
    config.sessionSecret,
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(host),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(FLOW_COOKIE, flow, cookieOptions(FLOW_SECONDS));
  return response;
}
