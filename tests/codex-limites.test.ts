import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { leerLineaLimites, limitesCodex } from "../src/lib/ia/codex-limites";

const ahora = new Date("2026-11-21T22:00:00-06:00");
const evento = (timestamp: string, rate_limits: object) =>
  JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: { type: "token_count", info: null, rate_limits },
  });

test("límites de Codex: lee 5 h y semanal con resets_at o resets_in_seconds, y nada del contenido", () => {
  const conFecha = leerLineaLimites(
    evento("2026-11-22T03:30:00.000Z", {
      primary: {
        used_percent: 31.4,
        window_minutes: 300,
        resets_at: Math.floor(new Date("2026-11-22T06:00:00Z").getTime() / 1000),
      },
      secondary: { used_percent: 96, window_minutes: 10080, resets_in_seconds: 3600 },
      plan_type: "plus",
    }),
    ahora,
  )!;
  assert.equal(conFecha.cincoHoras!.usado, 31.4);
  assert.equal(conFecha.cincoHoras!.reanuda, "2026-11-22T06:00:00.000Z");
  assert.equal(conFecha.semanal!.reanuda, "2026-11-22T04:30:00.000Z");
  assert.equal(conFecha.plan, "plus");
  // Reinicio ya pasado y sin uso nuevo: la ventana está en cero.
  const vencida = leerLineaLimites(
    evento("2026-11-21T10:00:00.000Z", { primary: { used_percent: 80, resets_in_seconds: 60 } }),
    ahora,
  )!;
  assert.equal(vencida.cincoHoras!.usado, 0);
  assert.equal(vencida.cincoHoras!.reanuda, null);
  // Otros eventos o líneas rotas se ignoran.
  assert.equal(
    leerLineaLimites(
      JSON.stringify({
        type: "response_item",
        payload: { type: "message", content: "rate_limits" },
      }),
      ahora,
    ),
    null,
  );
  assert.equal(leerLineaLimites("{rota rate_limits", ahora), null);
});

test("límites de Codex: toma el evento más reciente entre las sesiones de los últimos días", async () => {
  const raiz = path.resolve(`work/codex-limites-${process.pid}-${Date.now()}/sessions`);
  await mkdir(path.join(raiz, "2026/11/20"), { recursive: true });
  await mkdir(path.join(raiz, "2026/11/21"), { recursive: true });
  await writeFile(
    path.join(raiz, "2026/11/20/rollout-a.jsonl"),
    [
      evento("2026-11-20T20:00:00.000Z", {
        primary: { used_percent: 10, resets_in_seconds: 999999 },
      }),
    ].join("\n") + "\n",
  );
  await writeFile(
    path.join(raiz, "2026/11/21/rollout-b.jsonl"),
    [
      evento("2026-11-22T02:00:00.000Z", {
        primary: { used_percent: 20, resets_in_seconds: 9000 },
      }),
      JSON.stringify({
        timestamp: "2026-11-22T02:01:00.000Z",
        type: "response_item",
        payload: { type: "message" },
      }),
      evento("2026-11-22T03:00:00.000Z", {
        primary: { used_percent: 45, resets_in_seconds: 9000 },
        secondary: { used_percent: 70, resets_in_seconds: 90000 },
      }),
    ].join("\n") + "\n",
  );
  const l = (await limitesCodex({ carpeta: raiz, ahora }))!;
  assert.equal(l.cincoHoras!.usado, 45);
  assert.equal(l.semanal!.usado, 70);
  assert.equal(l.actualizado, "2026-11-22T03:00:00.000Z");
  assert.equal(await limitesCodex({ carpeta: path.join(raiz, "no-existe"), ahora }), null);
});
