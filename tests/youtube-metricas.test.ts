import assert from "node:assert/strict";
import { test } from "node:test";
import { permisoYoutubeAnalytics, youtube } from "../src/lib/granjas/adaptadores";
import { consultarYoutube } from "../src/lib/granjas/youtube-metricas";

const id = "UC0123456789012345678901";
const base = {
  id,
  snippet: {
    title: "Spotmi",
    customUrl: "@spotmi",
    thumbnails: { high: { url: "https://yt3.googleusercontent.com/photo" } },
  },
  statistics: { subscriberCount: "0", videoCount: "0" },
  contentDetails: { relatedPlaylists: { uploads: "UU0123456789012345678901" } },
};

test("YouTube muestra ceros explícitos del canal y distingue la autorización pendiente de Analytics", async () => {
  const resultado = await consultarYoutube(id, { acceso: "prueba" }, async (url, init) => {
    assert.match(url, /\/channels\?/);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer prueba");
    return Response.json({ items: [base] });
  });
  assert.equal(resultado.canal.suscriptores, 0);
  assert.equal(resultado.canal.vistas, null);
  assert.equal(resultado.analitica.estado, "permiso");
  assert.deepEqual(resultado.recientes, []);
  assert.ok(
    new URL(youtube.urlAutorizacion!("prueba", true)).searchParams
      .get("scope")
      ?.includes(permisoYoutubeAnalytics),
  );
});

test("YouTube muestra solo videos públicos propios y obtiene Analytics por cabeceras", async () => {
  const ids = ["a1234567890", "b1234567890", "c1234567890"];
  const resultado = await consultarYoutube(
    id,
    { acceso: "prueba", usuario: permisoYoutubeAnalytics },
    async (url) => {
      const u = new URL(url);
      switch (u.pathname) {
        case "/youtube/v3/channels":
          return Response.json({
            items: [
              {
                ...base,
                statistics: {
                  videoCount: "1",
                  subscriberCount: "100",
                  hiddenSubscriberCount: true,
                },
              },
            ],
          });
        case "/youtube/v3/playlistItems":
          return Response.json({ items: ids.map((videoId) => ({ contentDetails: { videoId } })) });
        case "/youtube/v3/videos":
          return Response.json({
            items: ids.map((videoId, i) => ({
              id: videoId,
              snippet: { channelId: i === 2 ? "otro-canal" : id },
              status: { privacyStatus: i === 1 ? "private" : "public" },
              statistics: { viewCount: "0" },
            })),
          });
        case "/v2/reports":
          assert.equal(u.searchParams.get("ids"), `channel==${id}`);
          return Response.json({
            columnHeaders: [
              { name: "views" },
              { name: "day" },
              { name: "estimatedMinutesWatched" },
            ],
            rows: [[0, "2026-11-18", 15]],
          });
        default:
          throw new Error("Ruta inesperada");
      }
    },
  );
  assert.equal(resultado.canal.suscriptores, null);
  assert.deepEqual(
    resultado.recientes?.map((v) => v.id),
    [ids[0]],
  );
  assert.deepEqual(resultado.analitica.dias, [
    { fecha: "2026-11-18", vistas: 0, minutos: 15, ganados: null, perdidos: null },
  ]);
});

test("Una API de Analytics sin habilitar conserva los datos del canal", async () => {
  const resultado = await consultarYoutube(
    id,
    { acceso: "prueba", usuario: permisoYoutubeAnalytics },
    async (url) =>
      url.includes("/channels?")
        ? Response.json({ items: [base] })
        : Response.json(
            {
              error: {
                message:
                  "YouTube Analytics API has not been used in project before or it is disabled.",
              },
            },
            { status: 403 },
          ),
  );
  assert.equal(resultado.analitica.estado, "api");
  assert.equal(resultado.canal.nombre, "Spotmi");
});
