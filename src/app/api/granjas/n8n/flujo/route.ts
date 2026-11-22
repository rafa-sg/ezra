import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorApi, propietario } from "@/lib/granjas/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await propietario();
    const flujo = await readFile(path.join(process.cwd(), "docs/n8n/ezra-meta.json"), "utf8");
    return new Response(flujo, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="ezra-meta.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorApi(error);
  }
}
