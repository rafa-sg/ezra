import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { clerkTestEnvironment, sessionToken } from "../helpers/clerk-fixture";

const base = "http://127.0.0.1:3106";
const get = (route: string, token = "") =>
  fetch(`${base}${route}`, {
    redirect: "manual",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
async function start(directory: string) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3106"],
    {
      env: {
        ...process.env,
        ...(await clerkTestEnvironment(directory)),
        EZRA_DATA_DIR: directory,
        // Never reach Gemini from tests, even if .env.local has a real key.
        GEMINI_API_KEY: "",
      },
      stdio: "pipe",
    },
  );
  let logs = "";
  server.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await get("/api/auth/session")).ok)
        return async () => {
          server.kill("SIGTERM");
          if (server.exitCode === null)
            await new Promise<void>((resolve) => server.once("exit", () => resolve()));
        };
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill("SIGTERM");
  throw new Error(`No se pudo iniciar el servidor aislado: ${logs}`);
}
test(
  "panel ezrá: reutiliza la sesión Clerk del piloto y protege las rutas por rol",
  { timeout: 90000 },
  async () => {
    await mkdir("work", { recursive: true });
    const directory = await mkdtemp(path.resolve("work/azra-test-"));
    const stop = await start(directory);
    const admin = sessionToken("owner", base, 180);
    try {
      const anonymous = await get("/azra/produccion");
      assert.ok([303, 307, 308].includes(anonymous.status), String(anonymous.status));
      assert.match(anonymous.headers.get("location") ?? "", /\/sign-in$/);
      for (const token of [sessionToken("outsider", base), admin + "tampered"]) {
        const denied = await get("/azra/settings/company", token);
        assert.ok([303, 307, 308].includes(denied.status));
      }
      const page = await get("/azra/produccion", admin);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /ezrá/);
      assert.match(html, /owner@example\.test/);
      // Sub-accounts are the pilot's real businesses, served by its authorized API.
      const businesses = (await (await get("/api/businesses", admin)).json()).businesses;
      assert.ok(businesses.length >= 3);
      // Ambas cuentas ven la interfaz nueva; los clientes no reciben encargos privados ni funciones de administración.
      const configure = await fetch(`${base}/api/auth/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${admin}` },
        body: JSON.stringify({ organizationId: "sgmotos", email: "sgmotos@example.test" }),
      });
      assert.equal(configure.status, 200);
      const clientToken = sessionToken("sgmotos", base, 180);
      const clientStudio = await get("/azra/produccion", clientToken);
      assert.equal(clientStudio.status, 200);
      const clientHtml = await clientStudio.text();
      assert.match(clientHtml, /sgmotos@example\.test/);
      assert.match(clientHtml, /Esta es la nueva interfaz/);
      assert.match(clientHtml, /Cazador de eventos/);
      assert.doesNotMatch(clientHtml, /Iniciá tu primer chat/);
      for (const retirada of [
        "/azra/content",
        "/azra/ai/chat",
        "/azra/bot",
        "/azra/settings/profile/general",
        "/azra/settings/company",
        "/azra/settings/users",
      ]) {
        const respuesta = await get(retirada, clientToken);
        assert.ok([303, 307, 308].includes(respuesta.status), retirada);
        assert.equal(
          new URL(respuesta.headers.get("location")!, base).pathname,
          "/azra/produccion",
          retirada,
        );
      }
      // Shared presentation must not widen the client organization boundary.
      const sgToken = sessionToken("sgmotos", base, 180);
      const ownBusinesses = (await (await get("/api/businesses", sgToken)).json()).businesses;
      assert.ok(ownBusinesses.length > 0);
      assert.ok(
        ownBusinesses.every((b: { organizationId: string }) => b.organizationId === "sgmotos"),
      );
      assert.equal((await get("/api/workspace?business=sgmotos-main", sgToken)).status, 200);
      assert.equal((await get("/api/workspace?business=motoxspress-main", sgToken)).status, 404);
      assert.equal((await get("/api/auth/accounts", sgToken)).status, 403);
      assert.equal((await get("/api/export?business=motoxspress-main", sgToken)).status, 404);
      // Ask AI: session required, business scoped to the account, key stays server-side.
      const ask = (business: string, token: string, history: unknown) =>
        fetch(`${base}/api/ask${business ? `?business=${business}` : ""}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ history }),
        });
      const question = [{ role: "user", text: "¿Qué hay programado hoy?" }];
      assert.equal((await ask("sgmotos-main", "", question)).status, 401);
      assert.equal((await ask("", sgToken, question)).status, 400);
      assert.equal((await ask("motoxspress-main", sgToken, question)).status, 404);
      assert.equal((await ask("sgmotos-main", sgToken, [])).status, 400);
      const noKey = await ask("sgmotos-main", sgToken, question);
      assert.equal(noKey.status, 503);
      assert.match((await noKey.json()).error, /GEMINI_API_KEY/);
      // Estudio Spotmi: solo administración, persistencia y revisión por versión.
      assert.equal((await get("/api/produccion")).status, 401);
      assert.equal((await get("/api/produccion", sgToken)).status, 403);
      for (const ruta of [
        "/api/granjas",
        "/api/granjas/conexiones",
        "/api/granjas/almacenamiento",
      ]) {
        assert.equal((await get(ruta)).status, 401);
        assert.equal((await get(ruta, sgToken)).status, 403);
      }
      const guardarGranja = (token: string) =>
        fetch(`${base}/api/granjas`, {
          method: "POST",
          headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            accion: "crear",
            datos: {
              nombre: "Prueba aislada de granjas",
              objetivo: "Sin servicios externos",
              formato: "publicacion",
              canales: ["spotmi"],
              politicaFuentes: { dominios: ["example.test"], maxFuentesPorPaso: 1 },
              ajustes: { zonaHoraria: "America/El_Salvador" },
            },
          }),
        });
      assert.equal((await guardarGranja(sgToken)).status, 403);
      const granjaCreada = await guardarGranja(admin);
      assert.equal(granjaCreada.status, 200);
      const idGranja = (await granjaCreada.json()).granja.id;
      assert.equal((await get(`/api/granjas/${idGranja}`, admin)).status, 200);
      assert.equal((await get(`/api/granjas/${idGranja}`, sgToken)).status, 403);
      const almacenamientoGranja = await (await get("/api/granjas/almacenamiento", admin)).json();
      assert.ok(almacenamientoGranja.rutas.base.startsWith(directory));
      assert.equal(almacenamientoGranja.remotos.length, 0);

      assert.equal((await get("/api/produccion/exportar", sgToken)).status, 403);
      assert.equal((await get("/api/produccion/spotmi", sgToken)).status, 403);
      assert.equal((await get("/azra/produccion", admin)).status, 200);
      assert.equal((await get("/azra/produccion", sgToken)).status, 200);
      const estudio = await (await get("/api/produccion", admin)).json();
      assert.deepEqual(estudio.produccion.encargos, []);
      assert.equal(estudio.conexiones.geminiHabilitado, false);
      const operar = (body: unknown, token = admin, ruta = "/api/produccion") =>
        fetch(`${base}${ruta}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      const contenido = {
        titulo: "Historia de prueba",
        agente: "guion",
        proveedor: "gemini",
        canales: ["spotmi", "tiktok"],
        encargo: "Nota verificada para la prueba",
        resultado: "Resultado para revisar",
        fuentes: [
          {
            nombre: "Fuente de prueba",
            url: "https://example.test/evento",
            imagen: "",
            nota: "Permiso revisado en prueba",
          },
        ],
        fechaPrevista: "2026-11-01T18:00",
      };
      assert.equal(
        (await operar({ accion: "crear", revision: 0, contenido }, sgToken)).status,
        403,
      );
      assert.equal(
        (await operar({ accion: "crear", revision: 0, contenido: { ...contenido, titulo: "" } }))
          .status,
        422,
      );
      const creada = await operar({ accion: "crear", revision: 0, contenido });
      assert.equal(creada.status, 200);
      let estado = await creada.json();
      const id = estado.encargoId;
      assert.equal(estado.produccion.encargos[0].estado, "pendiente");
      assert.equal((await operar({ accion: "crear", revision: 0, contenido })).status, 409);
      const checks = { hechos: true, derechos: true, marca: true };
      assert.equal(
        (
          await operar({
            accion: "estado",
            revision: estado.produccion.revision,
            id,
            estado: "aprobado",
            comprobaciones: checks,
          })
        ).status,
        422,
      );
      estado = await (
        await operar({
          accion: "estado",
          revision: estado.produccion.revision,
          id,
          estado: "revision",
          comprobaciones: checks,
        })
      ).json();
      estado = await (
        await operar({
          accion: "estado",
          revision: estado.produccion.revision,
          id,
          estado: "aprobado",
          comprobaciones: checks,
        })
      ).json();
      assert.equal(estado.produccion.encargos[0].estado, "aprobado");
      estado = await (
        await operar({
          accion: "derivar",
          revision: estado.produccion.revision,
          id,
          agente: "edicion",
        })
      ).json();
      assert.equal(estado.produccion.encargos[0].dependencia.id, id);
      const paquete = await get(`/api/produccion/exportar?id=${id}`, admin);
      assert.equal(paquete.status, 200);
      assert.equal(paquete.headers.get("content-type"), "application/zip");
      estado = await (
        await operar({
          accion: "editar",
          revision: estado.produccion.revision,
          id,
          contenido: { ...contenido, resultado: "Corrección nueva" },
        })
      ).json();
      assert.equal(
        estado.produccion.encargos.find((e: { id: string }) => e.id === id).estado,
        "pendiente",
      );
      assert.equal(
        (
          await operar(
            { id, revision: estado.produccion.revision, confirmar: true },
            admin,
            "/api/produccion/generar",
          )
        ).status,
        503,
      );
      assert.equal(
        (
          await operar(
            { id, revision: estado.produccion.revision, confirmar: true },
            sgToken,
            "/api/produccion/generar",
          )
        ).status,
        403,
      );
      assert.equal(
        (await (await get("/api/produccion", admin)).json()).produccion.encargos.length,
        2,
      );

      // «Bot de atención»: empty start, per-business storage, optimistic revision, isolation.
      const bot = (business: string, token: string, body?: unknown) =>
        fetch(`${base}/api/bot${business ? `?business=${business}` : ""}`, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      assert.equal((await bot("sgmotos-main", "")).status, 401);
      assert.equal((await bot("motoxspress-main", sgToken)).status, 404);
      assert.equal((await bot("", sgToken)).status, 400);
      const fresh = await (await bot("sgmotos-main", sgToken)).json();
      assert.equal(fresh.bot.revision, 0);
      assert.deepEqual(fresh.bot.conversations, []);
      assert.ok(fresh.connections.channels.every((c: { botEnabled: boolean }) => !c.botEnabled));
      assert.equal(fresh.connections.integration, "not_connected");
      const created = await bot("sgmotos-main", sgToken, {
        revision: 0,
        op: "saveKnowledge",
        entry: {
          title: "Garantía",
          content: "Prueba de integración.",
          category: "policies",
          keywords: ["garantía"],
          reviewBy: "",
        },
      });
      assert.equal(created.status, 200);
      assert.equal((await created.json()).bot.knowledge[0].status, "draft");
      // A stale revision never overwrites newer changes.
      assert.equal(
        (await bot("sgmotos-main", sgToken, { revision: 0, op: "setPaused", paused: true })).status,
        409,
      );
      assert.equal((await bot("sgmotos-main", sgToken, { revision: 1, op: "nope" })).status, 400);
      // Writing another business is refused; its bot stays empty.
      assert.equal(
        (await bot("motoxspress-main", sgToken, { revision: 0, op: "setPaused", paused: true }))
          .status,
        404,
      );
      const other = await (await bot("motoxspress-main", admin)).json();
      assert.deepEqual(other.bot.knowledge, []);
      const persisted = await (await bot("sgmotos-main", admin)).json();
      assert.equal(persisted.bot.knowledge[0].title, "Garantía");
      for (const page of [
        "/azra/bot",
        "/azra/bot/conversations",
        "/azra/bot/test",
        "/azra/bot/connections",
      ]) {
        const respuesta = await get(page, sgToken);
        assert.ok([303, 307, 308].includes(respuesta.status), page);
        assert.equal(
          new URL(respuesta.headers.get("location")!, base).pathname,
          "/azra/produccion",
          page,
        );
      }
      // The pilot entry and its login keep working.
      assert.equal((await get("/sign-in")).status, 200);
      // Administration no longer lands on the old «Mi panel»: it opens «Pregúntale a la IA».
      const home = await get("/", admin);
      assert.ok([303, 307, 308].includes(home.status));
      assert.equal(new URL(home.headers.get("location")!, base).pathname, "/azra/produccion");
      // «Pregúntale a la IA» is the panel home; removed pages redirect there.
      for (const old of [
        "/azra",
        "/azra/agency",
        "/azra/prospecting/accounts",
        "/azra/prospecting/analytics",
      ]) {
        const moved = await get(old, admin);
        assert.ok([303, 307, 308].includes(moved.status), old);
        assert.equal(
          new URL(moved.headers.get("location")!, base).pathname,
          "/azra/produccion",
          old,
        );
      }
      // Todas las pantallas del diseño retirado redirigen, incluidas las de configuración.
      for (const old of [
        "/azra/settings",
        "/azra/settings/billing",
        "/azra/settings/workflows",
        "/azra/settings/workflows/premium",
        "/azra/settings/phone",
        "/azra/settings/email/services",
        "/azra/settings/system-email/templates",
        "/azra/settings/announcements",
        "/azra/settings/domain-purchase",
        "/azra/settings/integrations",
        "/azra/settings/integrations/abc",
        "/azra/settings/api-keys",
        "/azra/settings/affiliates",
        "/azra/settings/menu-links",
        "/azra/settings/audit/logs",
        "/azra/settings/storage",
      ]) {
        const moved = await get(old, admin);
        assert.ok([303, 307, 308].includes(moved.status), old);
        assert.equal(
          new URL(moved.headers.get("location")!, base).pathname,
          "/azra/produccion",
          old,
        );
      }
      for (const kept of ["/azra/settings/company", "/azra/settings/users"])
        assert.ok([303, 307, 308].includes((await get(kept, admin)).status), kept);
      assert.equal((await get("/azra/no-existe", admin)).status, 404);
      // Todas las entradas autenticadas abren el mismo estudio; los visitantes conservan el acceso.
      for (const [route, token] of [
        ["/?business=sgmotos-main", admin],
        ["/", clientToken],
      ] as const) {
        const entry = await get(route, token);
        assert.ok([303, 307, 308].includes(entry.status), route);
        assert.equal(new URL(entry.headers.get("location")!, base).pathname, "/azra/produccion");
      }
      const acceso = await get("/");
      assert.equal(acceso.status, 200);
      const accesoHtml = await acceso.text();
      assert.match(accesoHtml, /Tu estudio de contenido para Spotmi/);
      assert.doesNotMatch(accesoHtml, /arcade-panel|AUTOMATIZA TU PRESENCIA/);
      // The Users screen reads the real access accounts through the pilot API.
      const accounts = (await (await get("/api/auth/accounts", admin)).json()).accounts;
      assert.ok(accounts.some((a: { email: string }) => a.email === "sgmotos@example.test"));
      // Agency logo: stored on the server, admin only, content-sniffed.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      const upload = (bytes: Buffer, name: string, token: string) => {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(bytes)]), name);
        return fetch(`${base}/api/agency/logo`, {
          method: "POST",
          body: form,
          headers: { authorization: `Bearer ${token}` },
        });
      };
      assert.equal((await (await get("/api/agency/logo?meta", admin)).json()).logo, null);
      assert.equal((await get("/api/agency/logo")).status, 401);
      assert.equal((await get("/api/agency/logo", sessionToken("sgmotos", base, 180))).status, 403);
      assert.equal((await upload(png, "logo.png", sessionToken("sgmotos", base, 180))).status, 403);
      // A renamed text file is rejected: the type comes from the bytes, not the name.
      assert.equal((await upload(Buffer.from("not an image"), "fake.png", admin)).status, 422);
      const saved = await upload(png, "logo.png", admin);
      assert.equal(saved.status, 200);
      const served = await get("/api/agency/logo", admin);
      assert.equal(served.headers.get("content-type"), "image/png");
      assert.equal(served.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
      const first = (await (await get("/api/agency/logo?meta", admin)).json()).logo.updatedAt;
      assert.equal((await upload(png, "again.png", admin)).status, 200);
      const second = (await (await get("/api/agency/logo?meta", admin)).json()).logo.updatedAt;
      assert.notEqual(first, second);
      const removed = await fetch(`${base}/api/agency/logo`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${admin}` },
      });
      assert.equal(removed.status, 200);
      assert.equal((await get("/api/agency/logo", admin)).status, 404);
    } finally {
      await stop();
    }
  },
);
