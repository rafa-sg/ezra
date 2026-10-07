import { NextResponse, type NextRequest } from "next/server";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  SESSION_SECONDS,
  authConfig,
  cookieOptions,
  createSession,
  redirectUri,
  verify,
} from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Flow = { state: string; verifier: string; nonce: string; host: string; exp: number };
type IdToken = {
  iss?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
};

// A 302 would keep the "cross-site" mark of Google's navigation and proxy.ts would reject the
// next page. A same-origin page that moves on by itself starts a clean same-origin navigation.
function bounce(path: string) {
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}"><title>ezrá</title><p>Entrando… <a href="${path}">Continuar</a></p></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Google returns here (a cross-site navigation, so proxy.ts skips the origin check for this
// route only). The signed flow cookie, state and PKCE protect it instead.
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const fail = (code: string) => {
    const response = bounce(`/login?error=${code}`);
    response.cookies.set(FLOW_COOKIE, "", cookieOptions(0));
    return response;
  };
  const config = authConfig();
  if (config.missing.length) return fail("config");
  const params = request.nextUrl.searchParams;
  if (params.get("error"))
    return fail(params.get("error") === "access_denied" ? "cancelled" : "google");
  const flow = await verify<Flow>(request.cookies.get(FLOW_COOKIE)?.value, config.sessionSecret);
  const code = params.get("code");
  if (!flow || flow.host !== host || !code || params.get("state") !== flow.state)
    return fail("expired");

  let tokens: { id_token?: string };
  try {
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri(host),
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!exchange.ok) return fail("google");
    tokens = await exchange.json();
  } catch {
    return fail("google");
  }
  // The token came straight from Google over TLS, so its claims are checked, not re-signed.
  let claims: IdToken;
  try {
    const part = tokens.id_token?.split(".")[1] || "";
    claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return fail("google");
  }
  if (
    !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss || "") ||
    claims.aud !== config.clientId ||
    claims.nonce !== flow.nonce ||
    typeof claims.exp !== "number" ||
    claims.exp < Date.now() / 1000
  )
    return fail("google");
  const email = claims.email?.toLowerCase();
  if (!email || claims.email_verified !== true) return fail("unverified");
  if (!config.allowed.includes(email)) return fail("not_allowed");

  const session = await createSession(
    { email, name: claims.name || claims.given_name || email },
    config.sessionSecret,
  );
  const response = bounce("/");
  response.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_SECONDS));
  response.cookies.set(FLOW_COOKIE, "", cookieOptions(0));
  return response;
}
