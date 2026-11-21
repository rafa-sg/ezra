import assert from "node:assert/strict";
import { test } from "node:test";
import { buscarVirales, entregaVirales, segundosDuracion } from "../src/lib/produccion/virales-youtube";
import { leerPedidoViral, textoPedidoViral } from "../src/lib/produccion/virales-texto";
import { crearEncargo, editarEncargo, encargoSchema, fuenteSchema } from "../src/lib/produccion/modelo";

const ahora = new Date("2026-11-21T12:00:00Z");
const video = (id: string, vistas: string, dias: number, extra: Record<string, unknown> = {}) => ({
  id,
  snippet: {
    title: `Video ${id}`,
    channelTitle: "Canal",
    channelId: "UC1",
    publishedAt: new Date(ahora.getTime() - dias * 86_400_000).toISOString(),
    liveBroadcastContent: "none",
    thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    ...extra,
  },
  statistics: { viewCount: vistas, likeCount: "100", commentCount: "10" },
  contentDetails: { duration: "PT1M5S" },
});

test("virales: el tema y el período viajan legibles en el encargo y se leen igual", () => {
  assert.deepEqual(leerPedidoViral(textoPedidoViral("  GTA 6  ", 90)), { tema: "GTA 6", dias: 90 });
  assert.deepEqual(leerPedidoViral(textoPedidoViral("GTA 6", 0)), { tema: "GTA 6", dias: 0 });
  // Texto escrito a mano sin período: últimos 30 días por defecto.
  assert.deepEqual(leerPedidoViral("trailers de GTA 6"), { tema: "trailers de GTA 6", dias: 30 });
  assert.equal(segundosDuracion("PT1H2M3S"), 3723);
  assert.equal(segundosDuracion("PT45S"), 45);
  assert.equal(segundosDuracion("raro"), null);
});

test("virales: busca por vistas en el período, ignora transmisiones en vivo y calcula vistas por día e interacción", async () => {
  const urls: URL[] = [];
  const videos = await buscarVirales(
    { tema: "GTA 6", dias: 30 },
    { acceso: "prueba" },
    async (url, init) => {
      const u = new URL(url);
      urls.push(u);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer prueba");
      if (u.pathname.endsWith("/search"))
        return Response.json({ items: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "aaaaaaaaaaa"].map((videoId) => ({ id: { videoId } })) });
      return Response.json({
        items: [
          video("aaaaaaaaaaa", "1000", 10),
          video("bbbbbbbbbbb", "5000", 1),
          video("ccccccccccc", "900000", 2, { liveBroadcastContent: "live" }),
        ],
      });
    },
    ahora,
  );
  const busqueda = urls[0].searchParams;
  assert.equal(busqueda.get("q"), "GTA 6");
  assert.equal(busqueda.get("order"), "viewCount");
  assert.equal(busqueda.get("type"), "video");
  assert.equal(busqueda.get("publishedAfter"), "2026-10-22T12:00:00Z");
  // Los ids repetidos se piden una sola vez.
  assert.equal(urls[1].searchParams.get("id"), "aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc");
  assert.deepEqual(videos.map((v) => v.id), ["bbbbbbbbbbb", "aaaaaaaaaaa"]);
  assert.equal(videos[1].vistasDia, 100);
  assert.equal(videos[0].duracion, 65);
  assert.equal(videos[1].interaccion, 0.11);
});

test("virales: sin tema no consulta YouTube; sin resultados devuelve una lista vacía", async () => {
  let llamadas = 0;
  const contar = async () => {
    llamadas++;
    return Response.json({ items: [] });
  };
  await assert.rejects(buscarVirales({ tema: "", dias: 30 }, { acceso: "x" }, contar, ahora), /tema/);
  assert.equal(llamadas, 0);
  assert.deepEqual(await buscarVirales({ tema: "nada", dias: 0 }, { acceso: "x" }, contar, ahora), []);
  assert.equal(llamadas, 1);
});

test("virales: la entrega trae enlaces válidos como fuentes (máx. 20) y la edición del pedido vacía la lista", async () => {
  const lista = await buscarVirales(
    { tema: "GTA 6", dias: 7 },
    { acceso: "x" },
    async (url) =>
      new URL(url).pathname.endsWith("/search")
        ? Response.json({ items: Array.from({ length: 30 }, (_, i) => ({ id: { videoId: `v${String(i).padStart(10, "0")}` } })) })
        : Response.json({ items: Array.from({ length: 30 }, (_, i) => video(`v${String(i).padStart(10, "0")}`, String(1000 + i), 3)) }),
    ahora,
  );
  assert.equal(lista.length, 25);
  const { texto, fuentes } = entregaVirales({ tema: "GTA 6", dias: 7 }, lista, ahora);
  assert.equal(fuentes.length, 20);
  for (const f of fuentes) fuenteSchema.parse(f);
  assert.match(texto, /https:\/\/www\.youtube\.com\/watch\?v=v0000000029/);
  assert.match(texto, /permiso del autor/);

  const encargo = crearEncargo({
    titulo: "Videos virales: GTA 6",
    agente: "virales",
    proveedor: "gemini",
    canales: ["youtube"],
    encargo: textoPedidoViral("GTA 6", 7),
    resultado: "",
    fuentes: [],
    fechaPrevista: "",
  });
  const conLista = encargoSchema.parse({ ...encargo, resultado: texto, fuentes, videos: lista, origenResultado: "youtube" });
  assert.equal(conLista.videos.length, 25);
  const editado = editarEncargo(conLista, { ...conLista, encargo: textoPedidoViral("GTA 6 tráiler", 7) });
  assert.equal(editado.version, conLista.version + 1);
  assert.deepEqual(editado.videos, []);
});
