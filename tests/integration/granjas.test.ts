import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import path from "node:path";
import { clerkTestEnvironment, sessionToken } from "../helpers/clerk-fixture";

const base = "http://127.0.0.1:3108";
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
async function iniciar(directorio: string) {
  const servidor = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3108"],
    {
      env: {
        ...process.env,
        ...(await clerkTestEnvironment(directorio)),
        EZRA_DATA_DIR: directorio,
        GEMINI_API_KEY: "",
        // Ninguna credencial social: la API debe explicar qué falta sin fingir conexiones.
        INSTAGRAM_APP_ID: "",
        META_APP_ID: "",
        TIKTOK_CLIENT_KEY: "",
        EZRA_TOKEN_KEY: "",
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
          if (servidor.exitCode === null)
            await new Promise<void>((r) => servidor.once("exit", () => r()));
        };
    } catch {
      /* arrancando */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  servidor.kill("SIGTERM");
  throw new Error(`No se pudo iniciar el servidor aislado: ${registro}`);
}

test(
  "granjas: solo administración, trabajador real en datos aislados y conexiones sin fingir",
  { timeout: 120000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directorio = await mkdtemp(path.resolve("work/granjas-integracion-"));
    const detener = await iniciar(directorio);
    const admin = sessionToken("owner", base, 300);
    try {
      assert.equal((await pedir("/api/granjas")).status, 401);
      assert.equal((await pedir("/api/granjas/n8n")).status, 401);
      assert.equal((await pedir("/api/granjas/n8n/flujo")).status, 401);
      const puente = await (await pedir("/api/granjas/n8n", admin)).json();
      assert.equal(puente.n8n.estado, "sin_configurar");
      assert.ok(!("secreto" in puente.n8n));
      const flujo = await (await pedir("/api/granjas/n8n/flujo", admin)).json();
      assert.equal(flujo.settings.saveDataSuccessExecution, "none");
      const accionNoPermitida = await pedir("/api/granjas/n8n", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "publicar" }),
      });
      assert.equal(accionNoPermitida.status, 422);
      const resumen = await (await pedir("/api/granjas", admin)).json();
      assert.equal(resumen.recetas.length, 3);
      assert.deepEqual(resumen.granjas, []);
      const creada = await pedir("/api/granjas", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "receta", clave: "evento_verificado" }),
      });
      assert.equal(creada.status, 200);
      const { granja } = await creada.json();
      // La base vive en la carpeta de prueba, nunca en data/.
      assert.ok((await stat(path.join(directorio, "granjas", "granjas.sqlite"))).size > 0);
      const detalle = await (await pedir(`/api/granjas/${granja.id}`, admin)).json();
      assert.ok(
        Object.values(detalle.faltantes).flat().length > 0,
        "el paso de medios explica lo que falta",
      );
      // Ejecutar sin pasos de IA: el trabajador del servidor deja al cazador esperando el resultado manual.
      const sinMedios = {
        nodos: granja.grafo.nodos
          .filter((n: { tipo: string }) => n.tipo !== "medios")
          .map((n: { agente: string | null; fuentes: unknown[] }) =>
            n.agente === "cazador" ? { ...n, fuentes: [] } : n,
          ),
        aristas: granja.grafo.aristas.filter((a: { desde: string; hacia: string }) =>
          granja.grafo.nodos.some(
            (n: { id: string; tipo: string }) => n.tipo !== "medios" && n.id === a.desde,
          ),
        ),
      };
      const guardada = await (
        await pedir("/api/granjas", admin, {
          method: "POST",
          body: JSON.stringify({
            accion: "actualizar",
            id: granja.id,
            revision: granja.revision,
            grafo: sinMedios,
          }),
        })
      ).json();
      assert.ok(guardada.granja, JSON.stringify(guardada));
      const conflicto = await pedir("/api/granjas", admin, {
        method: "POST",
        body: JSON.stringify({
          accion: "actualizar",
          id: granja.id,
          revision: granja.revision,
          estado: "pausada",
        }),
      });
      assert.equal(conflicto.status, 409);
      const inicio = await pedir("/api/granjas/ejecuciones", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "iniciar", granjaId: granja.id, confirmarIA: false }),
      });
      assert.equal(inicio.status, 200);
      let estado = "";
      for (let i = 0; i < 40 && estado !== "esperando_manual"; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const d = await (await pedir(`/api/granjas/${granja.id}`, admin)).json();
        estado = d.ultima.pasos.find((p: { nodoId: string }) =>
          d.granja.grafo.nodos.find(
            (n: { id: string; agente: string }) => n.id === p.nodoId && n.agente === "cazador",
          ),
        ).estado;
      }
      assert.equal(estado, "esperando_manual");

      // Conexiones: sin configuración no hay éxito simulado.
      const conexiones = await (await pedir("/api/granjas/conexiones", admin)).json();
      assert.equal(conexiones.claveTokens, false);
      for (const c of conexiones.conexiones) assert.equal(c.estado, "sin_configurar", c.canal);
      const autorizar = await pedir("/api/granjas/conexiones/instagram/autorizar", admin);
      assert.equal(autorizar.status, 503);
      assert.match((await autorizar.json()).error, /INSTAGRAM_APP_ID/);
      // Una respuesta OAuth sin sesión ni estado válido no guarda nada.
      const retorno = await pedir("/conexiones/facebook/callback?code=x&state=inventado");
      assert.equal(retorno.status, 303);
      assert.match(retorno.headers.get("location") ?? "", /conexion=facebook%3Aerror/);

      // Clientes: ven el estudio en lectura, pero ninguna API de granjas.
      await pedir("/api/auth/accounts", admin, {
        method: "POST",
        body: JSON.stringify({ organizationId: "sgmotos", email: "sgmotos@example.test" }),
      });
      const cliente = sessionToken("sgmotos", base, 300);
      for (const ruta of [
        "/api/granjas",
        `/api/granjas/${granja.id}`,
        "/api/granjas/conexiones",
        "/api/granjas/almacenamiento",
        "/api/granjas/piezas?id=" + granja.id,
      ])
        assert.equal((await pedir(ruta, cliente)).status, 403, ruta);
      assert.equal(
        (
          await pedir("/api/granjas", cliente, {
            method: "POST",
            body: JSON.stringify({ accion: "receta", clave: "video_vertical" }),
          })
        ).status,
        403,
      );
      // Otro sitio no puede accionar la API aunque traiga la sesión.
      const otroSitio = await pedir("/api/granjas/ejecuciones", admin, {
        method: "POST",
        headers: { Origin: "https://atacante.example" },
        body: JSON.stringify({ accion: "cancelar", ejecucionId: granja.id }),
      });
      assert.equal(otroSitio.status, 403);
      // El respaldo descargable es un ZIP sin tokens.
      const respaldo = await pedir("/api/granjas/almacenamiento?descargar=1", admin);
      assert.equal(respaldo.status, 200);
      assert.equal(respaldo.headers.get("content-type"), "application/zip");
    } finally {
      await detener();
    }
  },
);
