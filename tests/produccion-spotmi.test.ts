import test from "node:test";
import assert from "node:assert/strict";
import {
  configuracionPublica,
  consultarSpotmi,
  direccionSpotmi,
  leerJsonLimitado,
  slugFicha,
} from "../src/lib/produccion/spotmi";

test("el catálogo solo admite credenciales públicas y campos de fichas verificadas", async () => {
  const antes = {
    url: process.env.SPOTMI_SUPABASE_URL,
    key: process.env.SPOTMI_SUPABASE_ANON_KEY,
    site: process.env.SPOTMI_SITE_URL,
  };
  const fetchOriginal = globalThis.fetch;
  try {
    process.env.SPOTMI_SUPABASE_URL = "https://prueba.supabase.co";
    process.env.SPOTMI_SUPABASE_ANON_KEY = `eyJ0ZXN0.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.prueba`;
    assert.throws(() => configuracionPublica(), /clave pública/);
    process.env.SPOTMI_SUPABASE_ANON_KEY = `eyJ0ZXN0.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.prueba`;
    process.env.SPOTMI_SITE_URL = "https://spotmi.com.sv";
    assert.equal(direccionSpotmi(), "https://spotmi.com.sv");
    const consultas: URL[] = [];
    globalThis.fetch = (async (entrada: string | URL | Request) => {
      const url = new URL(String(entrada));
      consultas.push(url);
      assert.equal(url.searchParams.get("is_verified"), "eq.true");
      assert.ok(!url.searchParams.get("select")!.includes("created_by"));
      if (url.pathname.endsWith("/events"))
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Evento de prueba",
            description: null,
            date: "2026-11-01T18:00:00+00:00",
            venue: null,
            department: null,
            cover_image_url: null,
            source_url: "javascript:alert(1)",
            website: null,
          },
        ]);
      assert.equal(url.searchParams.get("source"), "eq.official");
      return Response.json([
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Lugar de prueba",
          description: null,
          department: "San Salvador",
          cover_image_url: "https://example.test/imagen.jpg",
          is_generated_image: true,
        },
      ]);
    }) as typeof fetch;
    const catalogo = await consultarSpotmi();
    assert.equal(consultas.length, 2);
    assert.equal(catalogo.fichas.length, 2);
    assert.equal(catalogo.fichas[0].fuente, null);
    assert.equal(catalogo.fichas[1].imagenGenerada, true);
    assert.equal(catalogo.fichas[1].ruta, "/es/lugares/lugar-de-prueba-2222");
    assert.equal(slugFicha("Volcán de Santa Ana", "a3f9-test"), "volcan-de-santa-ana-a3f9");
    assert.equal(new URL(consultas[0]).searchParams.get("limit"), "200");
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const [nombre, valor] of Object.entries({
      SPOTMI_SUPABASE_URL: antes.url,
      SPOTMI_SUPABASE_ANON_KEY: antes.key,
      SPOTMI_SITE_URL: antes.site,
    }))
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
  }
});
test("la lectura de respuestas limita bytes y rechaza HTML o JSON malformado", async () => {
  await assert.rejects(
    () => leerJsonLimitado(new Response("<html>error</html>")),
    /formato inválido/,
  );
  await assert.rejects(
    () => leerJsonLimitado(new Response(new Uint8Array(2_000_001))),
    /límite de lectura/,
  );
  await assert.rejects(
    () => leerJsonLimitado(new Response("{}", { status: 403 })),
    /catálogo público/,
  );
});
