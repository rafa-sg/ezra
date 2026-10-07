import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfig, readSession } from "@/lib/auth";

// Reachable without a session: the login page, the sign-in routes, the icon, and the n8n
// callback (which has its own shared secret).
const openPaths = ["/login", "/icon.svg", "/api/automation/results"];

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  // n8n in Docker reaches the Mac as host.docker.internal. Only the secret-protected
  // results callback accepts that host; everything else stays loopback-only.
  const dockerCallback =
    request.nextUrl.pathname === "/api/automation/results" &&
    /^host\.docker\.internal(:\d+)?$/.test(host);
  if (!dockerCallback && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
    return NextResponse.json(
      { error: "Este piloto solo está disponible en tu computadora." },
      { status: 403 },
    );
  const path = request.nextUrl.pathname;
  // Google sends the owner back with a cross-site navigation; state + PKCE protect that route.
  const googleReturn = request.method === "GET" && path === "/api/auth/callback/google";
  const origin = request.headers.get("origin");
  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  if (
    !googleReturn &&
    (crossSite || (origin && origin !== `http://${host}` && origin !== `https://${host}`))
  )
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  if (!authConfig().off && !openPaths.includes(path) && !path.startsWith("/api/auth/")) {
    const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user)
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 })
        : NextResponse.redirect(new URL("/login", `http://${host}`));
  }
  const response = NextResponse.next();
  if (path.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
