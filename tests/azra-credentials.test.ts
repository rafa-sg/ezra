import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoCredentialService } from "../src/features/azra/credentials/demo";
import { CredentialError, ROTATION_DURATION } from "../src/features/azra/credentials/model";
import es from "../src/features/azra/messages/es.json";
import en from "../src/features/azra/messages/en.json";
function fixture() {
  let raw: string | null = null;
  let time = 1000;
  let sequence = 0;
  const storage = {
    read: () => raw,
    write: (value: string) => {
      raw = value;
    },
  };
  const service = new DemoCredentialService(
    storage,
    () => time,
    () => `id-${++sequence}`,
  );
  return {
    service,
    storage,
    advance: (value: number) => {
      time += value;
    },
  };
}
const input = {
  name: "Example",
  description: "Explicit demonstration",
  scopes: ["companies.readonly" as const],
};
const error = (code: string) => (e: unknown) => e instanceof CredentialError && e.code === code;
test("demo creation persists only unmistakable fake credentials and validated permissions", async () => {
  const { service, storage } = fixture();
  const item = await service.create(input);
  assert.match(item.tokens[0].value, /^DEMO-NOT-A-CREDENTIAL-/);
  assert.deepEqual(await new DemoCredentialService(storage).get(item.id), item);
  await assert.rejects(service.create({ ...input, name: " " }), error("invalidData"));
  await assert.rejects(service.updateScopes(item.id, []), error("invalidData"));
  assert.deepEqual((await service.get(item.id)).scopes, input.scopes);
  assert.deepEqual(
    (await service.updateScopes(item.id, ["locations.write", "locations.write"])).scopes,
    ["locations.write"],
  );
});
test("rotation keeps old credential until exactly seven days and then promotes the pending token", async () => {
  const { service, advance } = fixture();
  const item = await service.create(input);
  const rotated = await service.rotate(item.id);
  assert.equal(rotated.tokens[0].state, "pending");
  assert.equal(rotated.tokens[1].state, "active");
  await assert.rejects(service.rotate(item.id), error("rotationExists"));
  advance(ROTATION_DURATION - 1);
  assert.equal((await service.get(item.id)).tokens[1].state, "active");
  advance(1);
  const settled = await service.get(item.id);
  assert.equal(settled.tokens[0].state, "active");
  assert.equal(settled.tokens[1].state, "expired");
  assert.equal(settled.rotationEndsAt, null);
});
test("cancel rotation revokes new token and retains old; expiring old promotes new immediately", async () => {
  const { service } = fixture();
  const item = await service.create(input);
  await service.rotate(item.id);
  const cancelled = await service.cancelRotation(item.id);
  assert.equal(cancelled.tokens[0].state, "revoked");
  assert.equal(cancelled.tokens[1].state, "active");
  await assert.rejects(service.cancelRotation(item.id), error("noRotation"));
  const rotated = await service.rotate(item.id);
  const expired = await service.revokeToken(item.id, item.tokens[0].id);
  assert.equal(expired.tokens.find((t) => t.id === rotated.tokens[0].id)?.state, "active");
  assert.equal(expired.rotationEndsAt, null);
});
test("revoking pending token keeps original valid, while revoking the sole active token disables integration", async () => {
  const { service } = fixture();
  const item = await service.create(input);
  const rotated = await service.rotate(item.id);
  const updated = await service.revokeToken(item.id, rotated.tokens[0].id);
  assert.equal(updated.revoked, false);
  assert.equal(updated.rotationEndsAt, null);
  const revoked = await service.revokeToken(item.id, item.tokens[0].id);
  assert.equal(revoked.revoked, true);
  await assert.rejects(service.rotate(item.id), error("revoked"));
  await assert.rejects(service.updateScopes(item.id, input.scopes), error("revoked"));
});
test("whole integration revocation terminates rotation and all usable tokens", async () => {
  const { service, advance } = fixture();
  const item = await service.create(input);
  await service.rotate(item.id);
  await service.revokeIntegration(item.id);
  advance(ROTATION_DURATION);
  const revoked = await service.get(item.id);
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.rotationEndsAt, null);
  assert.ok(revoked.tokens.every((t) => t.state === "revoked"));
  await assert.rejects(service.get("missing"), error("notFound"));
});
test("corruption and storage failure are surfaced without silently resetting user data", async () => {
  const { service, storage } = fixture();
  storage.write('{"version":999}');
  await assert.rejects(service.list(), error("invalidData"));
  assert.equal(storage.read(), '{"version":999}');
  const failing = new DemoCredentialService({
    read: () => null,
    write: () => {
      throw Error("quota");
    },
  });
  await assert.rejects(failing.create(input), error("storage"));
});
test("Spanish and English cover identical interface keys", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
});
