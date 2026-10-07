// Google sign-in for the single owner. Uses Web Crypto only, so it runs in proxy.ts and in routes.
// Nothing here may reach the browser except the user's name and email.
export const SESSION_COOKIE = "ezra_session";
export const FLOW_COOKIE = "ezra_oauth";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const FLOW_SECONDS = 60 * 10;

export type SessionUser = { email: string; name: string };
type Payload = SessionUser & { exp: number };

const encoder = new TextEncoder();

export function authConfig() {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET?.trim() || "";
  const sessionSecret = process.env.AUTH_SECRET?.trim() || "";
  const allowed = (process.env.AUTH_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const missing = [
    !clientId && "AUTH_GOOGLE_CLIENT_ID",
    !clientSecret && "AUTH_GOOGLE_CLIENT_SECRET",
    sessionSecret.length < 32 && "AUTH_SECRET",
    !allowed.length && "AUTH_ALLOWED_EMAILS",
  ].filter(Boolean) as string[];
  return {
    // Only for automated tests: the real studio never runs without sign-in.
    off: process.env.EZRA_AUTH === "off",
    clientId,
    clientSecret,
    sessionSecret,
    allowed,
    missing,
  };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text: string) {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}
/** Signs any JSON payload as `payload.signature`. */
export async function sign(payload: object, secret: string) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}
/** Returns the payload only if the signature matches (constant-time inside Web Crypto). */
export async function verify<T extends { exp: number }>(token: string | undefined, secret: string) {
  if (!token || !secret) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export async function createSession(user: SessionUser, secret: string) {
  const payload: Payload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  return sign(payload, secret);
}
export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  const { sessionSecret, allowed } = authConfig();
  const payload = await verify<Payload>(token, sessionSecret);
  // Removing an address from AUTH_ALLOWED_EMAILS ends its sessions immediately.
  if (!payload || !allowed.includes(payload.email)) return null;
  return { email: payload.email, name: payload.name };
}

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function codeChallenge(verifier: string) {
  return toBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))),
  );
}

/** Only loopback origins are ever used as the Google redirect address. */
export function redirectUri(host: string) {
  return `http://${host}/api/auth/callback/google`;
}
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: false, // loopback over http; Chrome/Firefox accept this on 127.0.0.1 and localhost
  };
}

/** Maps the error codes we raise to short Spanish messages for the login page. */
export const loginErrors: Record<string, string> = {
  not_allowed: "Esa cuenta de Google no tiene acceso a este estudio.",
  cancelled: "Cancelaste el inicio de sesión con Google.",
  expired: "El intento de inicio de sesión caducó. Inténtalo de nuevo.",
  google: "Google no aceptó la conexión. Revisa las claves y la dirección de retorno.",
  unverified: "Google indica que ese correo no está verificado.",
  config: "Falta configurar el inicio de sesión.",
};
