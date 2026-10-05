import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
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
  const origin = request.headers.get("origin");
  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  if (crossSite || (origin && origin !== `http://${host}` && origin !== `https://${host}`))
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/"))
    response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
