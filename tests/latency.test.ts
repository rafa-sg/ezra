import test from "node:test";
import assert from "node:assert/strict";
import { inFlight } from "../src/lib/in-flight";
import { detailPrefetch } from "../src/lib/detail-prefetch";

test("perfiles simultáneos comparten consulta por identidad, sin retener resultados o fallos", async () => {
  const read = inFlight<string, number>();
  let calls = 0;
  let finish!: (value: number) => void;
  const task = () => { calls++; return new Promise<number>((resolve) => { finish = resolve; }); };
  const a = read("owner", task);
  const b = read("owner", task);
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(calls, 1);
  const other = read("guest", async () => 9);
  assert.equal(await other, 9);
  finish(1);
  assert.deepEqual(await Promise.all([a, b]), [1, 1]);
  assert.equal(await read("owner", async () => 2), 2, "una consulta posterior comprueba el perfil otra vez");
  await assert.rejects(read("owner", async () => { throw new Error("offline"); }), /offline/);
  assert.equal(await read("owner", async () => 3), 3);
});

test("anticipar ficha consume una sola consulta; volver a abrir obtiene una nueva", async () => {
  let calls = 0;
  const loader = detailPrefetch(async (id) => { calls++; return id; });
  loader.warm("a");
  loader.warm("a");
  const first = loader.take("a");
  assert.equal(await first.promise, "a");
  assert.equal(calls, 1);
  assert.equal(await loader.take("a").promise, "a");
  assert.equal(calls, 2);
});

test("otra ficha, un resumen nuevo o una anticipación vencida descartan la lectura anterior", async () => {
  let clock = 0;
  const signals: AbortSignal[] = [];
  const loader = detailPrefetch(async (id, signal) => { signals.push(signal); return id; }, () => clock);
  loader.warm("a");
  await Promise.resolve();
  loader.warm("b");
  await Promise.resolve();
  assert.equal(signals[0].aborted, true);
  loader.dispose();
  assert.equal(signals[1].aborted, true);
  loader.warm("c");
  await Promise.resolve();
  clock = 3001;
  const opened = loader.take("c");
  assert.equal(signals[2].aborted, true);
  assert.equal(await opened.promise, "c");
  assert.equal(signals.length, 4);
  opened.controller.abort();
  assert.equal(signals[3].aborted, true);
});

test("un fallo anticipado no impide reintentar al abrir ni produce un rechazo sin manejar", async () => {
  let fail = true;
  const loader = detailPrefetch(async () => {
    if (fail) throw new Error("offline");
    return "ok";
  });
  loader.warm("a");
  await new Promise<void>((resolve) => setImmediate(resolve));
  fail = false;
  assert.equal(await loader.take("a").promise, "ok");
});
