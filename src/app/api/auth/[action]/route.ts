import { sessionAccount, listAccounts, saveClientAccount } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { WorkflowError } from "@/lib/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { action } = await params;
    if (action === "accounts") return Response.json({ accounts: await listAccounts() });
    if (action !== "session") throw new WorkflowError("Ruta no encontrada.", 404);
    return Response.json({
      account: await sessionAccount(),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { action } = await params;
    if (["setup", "login", "logout"].includes(action))
      throw new WorkflowError(
        "El acceso se gestiona con Clerk. Usa la pantalla de inicio de sesión.",
        410,
      );
    const text = await request.text();
    if (Buffer.byteLength(text) > 4096)
      throw new WorkflowError("La solicitud supera el límite.", 413);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new WorkflowError("Formato inválido.", 400);
    }
    if (action === "accounts") return Response.json(await saveClientAccount(data));
    throw new WorkflowError("Ruta no encontrada.", 404);
  } catch (error) {
    return apiError(error);
  }
}
