import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  return user
    ? Response.json({ user })
    : Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
