import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const authenticate = clerkMiddleware(
  () => NextResponse.next(),
  (request: NextRequest) => {
    const host = request.headers.get("host") || "";
    return { authorizedParties: [`http://${host}`, `https://${host}`] };
  },
);

// Dominios públicos permitidos además de la computadora local (solo en el servidor). Ejemplo:
// EZRA_DOMINIOS=ezra.spotmi.com.sv. Vacío = Ezra solo responde en localhost, como siempre.
const dominiosPermitidos = (process.env.EZRA_DOMINIOS || "")
  .split(",")
  .map((dominio) => dominio.trim().toLowerCase())
  .filter(Boolean);

function hostPermitido(host: string) {
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return true;
  const nombre = host.toLowerCase().replace(/:\d+$/, "");
  return dominiosPermitidos.includes(nombre);
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const host = request.headers.get("host") || "";
  // n8n in Docker reaches the Mac as host.docker.internal. Only the secret-protected
  // results callback accepts that host; everything else stays loopback-only or EZRA_DOMINIOS.
  const dockerCallback =
    request.nextUrl.pathname === "/api/automation/results" &&
    /^host\.docker\.internal(:\d+)?$/.test(host);
  if (!dockerCallback && !hostPermitido(host))
    return NextResponse.json(
      { error: "Ezra no está disponible en esta dirección." },
      { status: 403 },
    );
  const origin = request.headers.get("origin");
  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  const protectedOrigin =
    request.nextUrl.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method);
  if (
    protectedOrigin &&
    (crossSite || (origin && origin !== `http://${host}` && origin !== `https://${host}`))
  )
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  // The n8n callback authenticates using its own secret; it needs no browser session.
  const response =
    request.nextUrl.pathname === "/api/automation/results"
      ? NextResponse.next()
      : (await authenticate(request, event)) || NextResponse.next();
  // Clerk uses a self-rewrite to attach verified request headers. Next 16 may
  // treat localhost vs 127.0.0.1 as an external proxy and recurse indefinitely.
  // Continue locally while retaining every Clerk request-header override.
  if (response.headers.get("x-middleware-rewrite") === request.url) {
    response.headers.delete("x-middleware-rewrite");
    response.headers.set("x-middleware-next", "1");
  }
  if (request.nextUrl.pathname.startsWith("/api/"))
    response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/(api|trpc)(.*)", "/__clerk/:path*"],
};
