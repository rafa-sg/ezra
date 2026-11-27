import test from "node:test";
import assert from "node:assert/strict";
import { serverTiming } from "../src/lib/server-timing";

test("los tiempos de peticiones simultáneas son independientes y cada fase excluye la anterior", () => {
  let clock = 0;
  const first = serverTiming(() => clock);
  clock = 5;
  const second = serverTiming(() => clock);
  clock = 12;
  first.mark("access");
  clock = 15;
  second.mark("access");
  clock = 18;
  first.mark("read");
  assert.equal(first.header(), "access;dur=12.00, read;dur=6.00, total;dur=18.00");
  assert.equal(second.header(), "access;dur=10.00, total;dur=13.00");
});
