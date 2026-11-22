import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { clerkTestEnvironment, fixtureInvitations, sessionToken } from "../helpers/clerk-fixture";

const base = "http://127.0.0.1:3109";
const pedir = (ruta: string, token = "", init: RequestInit = {}) =>
  fetch(`${base}${ruta}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
const post = (ruta: string, token: string, cuerpo: object) =>
  pedir(ruta, token, { method: "POST", body: JSON.stringify(cuerpo) });

async function iniciar(directorio: string) {
  const servidor = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3109"],
    {
      env: {
        ...process.env,
        ...(await clerkTestEnvironment(directorio)),
        EZRA_DATA_DIR: directorio,
        EZRA_GRANJAS_TRABAJADOR: "0",
        GEMINI_API_KEY: "",
        INSTAGRAM_APP_ID: "",
        META_APP_ID: "",
        TIKTOK_CLIENT_KEY: "",
        EZRA_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"),
      },
      stdio: "pipe",
    },
  );
  let registro = "";
  servidor.stderr.on("data", (t) => (registro += t));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await pedir("/api/auth/session")).ok)
        return async () => {
          servidor.kill("SIGTERM");
          if (servidor.exitCode === null) await new Promise<void>((r) => servidor.once("exit", () => r()));
        };
    } catch {
      /* arrancando */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  servidor.kill("SIGTERM");
  throw new Error(`No se pudo iniciar el servidor aislado: ${registro}`);
}

test("equipo: solo por invitación, roles y secciones comprobados en el servidor", { timeout: 120000 }, async () => {
  await mkdir("work", { recursive: true });
  const directorio = await mkdtemp(path.resolve("work/equipo-integracion-"));
  const detener = await iniciar(directorio);
  const dueno = sessionToken("owner", base, 300);
  const socio = sessionToken("socio", base, 300);
  const invitado = sessionToken("invitado", base, 300);
  const extrano = sessionToken("outsider", base, 300);
  try {
    // Sin invitación nadie entra, aunque su cuenta de Clerk exista y esté verificada.
    for (const token of [socio, invitado, extrano]) {
      assert.equal((await pedir("/api/granjas", token)).status, 403);
      assert.equal((await pedir("/api/equipo", token)).status, 403);
    }
    // El propietario invita: Clerk (ficticio) recibe la invitación; Ezra guarda la fila pendiente.
    const r1 = await post("/api/equipo", dueno, { accion: "invitar", datos: { email: "socio@example.test", rol: "socio" } });
    assert.equal(r1.status, 200, await r1.clone().text());
    const { miembros } = await r1.json();
    assert.equal(miembros.find((m: { email: string }) => m.email === "socio@example.test").estado, "invitado");
    assert.ok(fixtureInvitations.some((i) => i.email === "socio@example.test" && !i.revoked));
    const r2 = await post("/api/equipo", dueno, {
      accion: "invitar",
      datos: { email: "invitado@example.test", rol: "invitado", secciones: ["eventos"], soloLectura: true },
    });
    assert.equal(r2.status, 200);

    // Socio: usa el estudio, pero no administra el equipo ni lo que es solo del propietario.
    assert.equal((await pedir("/api/granjas", socio)).status, 200);
    assert.equal((await pedir("/api/granjas/eventos", socio)).status, 200);
    const yo = await (await pedir("/api/equipo", socio)).json();
    assert.equal(yo.yo.rol, "socio");
    assert.equal(yo.miembros, null, "un socio no ve la lista del equipo");
    assert.equal(
      (await post("/api/equipo", socio, { accion: "invitar", datos: { email: "x@example.test", rol: "socio" } })).status,
      403,
    );
    for (const ruta of ["/api/granjas/n8n", "/api/granjas/almacenamiento", "/api/produccion/ia-local", "/api/produccion/onboarding"])
      assert.equal((await pedir(ruta, socio)).status, 403, ruta);
    assert.equal((await post("/api/granjas/consumo", socio, { accion: "imagenes_ia", porDia: 5 })).status, 403);

    // Invitado de solo lectura con Eventos: lee eventos; nada más, y no escribe.
    assert.equal((await pedir("/api/granjas/eventos", invitado)).status, 200);
    for (const ruta of ["/api/granjas", "/api/granjas/conexiones", "/api/granjas/consumo", "/api/produccion/inicio"])
      assert.equal((await pedir(ruta, invitado)).status, 403, ruta);
    const escribir = await post("/api/granjas/eventos", invitado, { accion: "descartar", id: crypto.randomUUID(), motivo: "x" });
    assert.equal(escribir.status, 403);
    assert.match((await escribir.json()).error, /solo lectura/);
    // El estudio abre para el invitado, pero sin encargos (no tiene esa sección).
    const prod = await (await pedir("/api/produccion", invitado)).json();
    assert.deepEqual(prod.produccion.encargos, []);

    // Quitar acceso: el socio deja de entrar de inmediato.
    const lista = (await (await pedir("/api/equipo", dueno)).json()).miembros as { id: string; email: string }[];
    const idSocio = lista.find((m) => m.email === "socio@example.test")!.id;
    assert.equal((await post("/api/equipo", dueno, { accion: "retirar", id: idSocio })).status, 200);
    assert.equal((await pedir("/api/granjas", socio)).status, 403);
    // El propietario no puede quitarse el acceso a sí mismo.
    const idDueno = lista.find((m) => m.email === "owner@example.test")!.id;
    assert.equal((await post("/api/equipo", dueno, { accion: "retirar", id: idDueno })).status, 409);
  } finally {
    await detener();
  }
});
