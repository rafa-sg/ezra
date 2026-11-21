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
        // Esta prueba verifica el trabajador real (en datos aislados): se enciende aunque el entorno
        // lo apague, como hace el contenedor de Docker con EZRA_GRANJAS_TRABAJADOR=0.
        EZRA_GRANJAS_TRABAJADOR: "1",
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
      // n8n lee .env.n8n.local del proyecto: en la Mac del propietario existe. Sin una
      // verificación real nunca aparece como conectada.
      assert.ok(["sin_configurar", "sin_verificar"].includes(puente.n8n.estado), puente.n8n.estado);
      assert.ok(!("secreto" in puente.n8n));
      const flujo = await (await pedir("/api/granjas/n8n/flujo", admin)).json();
      assert.equal(flujo.settings.saveDataSuccessExecution, "none");
      const accionNoPermitida = await pedir("/api/granjas/n8n", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "publicar" }),
      });
      assert.equal(accionNoPermitida.status, 422);
      const resumen = await (await pedir("/api/granjas", admin)).json();
      for (const clave of ["evento_verificado", "carrusel_spot", "video_vertical"])
        assert.ok(resumen.recetas.some((r: { clave: string }) => r.clave === clave), clave);
      assert.deepEqual(resumen.granjas, []);
      assert.deepEqual(resumen.especialistas, ["cazador", "verificador", "imagen_evento", "redactor_ig", "disenador_post"]);
      // Consumo: vacío, sin precios en el código y sin fingir llamadas.
      assert.equal((await pedir("/api/granjas/consumo")).status, 401);
      const consumo = await (await pedir("/api/granjas/consumo", admin)).json();
      assert.equal(consumo.periodos.mes.llamadas, 0);
      assert.deepEqual(consumo.tarifas, {});
      assert.equal(consumo.serie.length, 30);
      const presupuesto = await pedir("/api/granjas/consumo", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "presupuesto", presupuesto: { tokensDia: 50000, tokensMes: 900000 } }),
      });
      assert.equal(presupuesto.status, 200);
      assert.equal((await presupuesto.json()).presupuesto.tokensDia, 50000);
      const ocultar = await pedir("/api/granjas/especialistas", admin, {
        method: "POST",
        body: JSON.stringify({ visibles: [] }),
      });
      assert.equal(ocultar.status, 422, "al menos un especialista visible");
      // Bandeja de eventos: vacía, sin Spotmi conectado y con respaldo descargable.
      assert.ok(resumen.recetas.some((r: { clave: string }) => r.clave === "eventos_el_salvador"));
      assert.equal((await pedir("/api/granjas/eventos")).status, 401);
      const bandeja = await (await pedir("/api/granjas/eventos", admin)).json();
      assert.equal(bandeja.total, 0);
      assert.equal(bandeja.spotmi, false);
      const csv = await pedir("/api/granjas/eventos/exportar?formato=csv", admin);
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get("content-disposition") ?? "", /eventos-\d{4}-\d{2}-\d{2}\.csv/);
      // BOM para que Excel abra bien los acentos (Response.text() lo quitaría).
      const bytes = Buffer.from(await csv.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.match(bytes.subarray(3).toString("utf8"), /^titulo,fecha,fecha_fin,hora/);
      const sinSpotmi = await pedir("/api/granjas/eventos", admin, {
        method: "POST",
        body: JSON.stringify({ accion: "enviar_spotmi", id: crypto.randomUUID() }),
      });
      assert.equal(sinSpotmi.status, 409, "sin cuenta editorial no se envía nada");
      // Horario y posts: activar exige consentimiento; sin posts no hay nada que subir.
      assert.ok(resumen.recetas.some((r: { clave: string }) => r.clave === "post_instagram_eventos"));
      const diaria = await (
        await pedir("/api/granjas", admin, { method: "POST", body: JSON.stringify({ accion: "receta", clave: "eventos_el_salvador" }) })
      ).json();
      // Un día que no es hoy (hora de El Salvador): el reloj del servidor no debe ejecutarla.
      const otroDia = (new Date(Date.now() - 6 * 3600_000).getUTCDay() + 3) % 7;
      const programar = (aceptoIA: boolean) =>
        pedir("/api/granjas/horarios", admin, {
          method: "POST",
          body: JSON.stringify({ granjaId: diaria.granja.id, horario: { activa: true, hora: "04:30", dias: [otroDia], despuesDe: null }, aceptoIA, maximo: 3 }),
        });
      assert.equal((await programar(false)).status, 422);
      const programada = await (await programar(true)).json();
      assert.equal(programada.horario.activa, true);
      assert.ok(programada.horario.proxima);
      assert.equal(programada.granja.ajustes.eventos.maxPorDia, 3);
      // Se apaga enseguida: la prueba no debe ejecutar nada a las 4:30.
      await pedir("/api/granjas/horarios", admin, {
        method: "POST",
        body: JSON.stringify({ granjaId: diaria.granja.id, horario: { activa: false, hora: "04:30", dias: [1], despuesDe: null } }),
      });
      assert.equal((await pedir("/api/granjas/horarios")).status, 401);
      assert.deepEqual((await (await pedir("/api/granjas/posts", admin)).json()).posts, []);
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
        "/api/granjas/consumo",
        "/api/granjas/especialistas",
        "/api/granjas/eventos",
        "/api/granjas/eventos/exportar",
        "/api/granjas/horarios",
        "/api/granjas/posts",
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
