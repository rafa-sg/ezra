import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoAccountService } from "../src/features/azra/account/demo";
import { AccountError, type Company, type Profile } from "../src/features/azra/account/model";
function fixture(initial: string | null = null) {
  let raw = initial;
  let sequence = 0;
  const storage = {
    read: () => raw,
    write: (value: string) => {
      raw = value;
    },
  };
  const service = new DemoAccountService(storage, () => `0000000${++sequence}-1234-5678`);
  return { service, storage, raw: () => raw };
}
const profile: Profile = {
  firstName: "Ejemplo",
  lastName: "Demo",
  email: "demo@example.com",
  phone: { country: "SV", number: "0000 0000" },
  extension: "",
  language: "en-US",
};
const company: Company = {
  name: "Empresa de ejemplo",
  email: "empresa@example.com",
  phone: { country: "SV", number: "" },
  website: "",
  category: "creative",
  niche: "",
  primaryUse: "other",
  primaryUseDetail: "",
};
const error = (code: string) => (e: unknown) => e instanceof AccountError && e.code === code;
test("account demo starts without people, companies or users and keeps a stable DEMO id", async () => {
  const { service, storage } = fixture();
  const first = await service.get();
  assert.equal(first.profile, null);
  assert.equal(first.company, null);
  assert.match(first.relationshipId, /^DEMO-\d{3}-\d{3}$/);
  assert.deepEqual(await service.listUsers(), []);
  assert.equal((await new DemoAccountService(storage).get()).relationshipId, first.relationshipId);
});
test("profile and company are validated before persisting; the owner appears as the only user", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.updateProfile({ ...profile, email: "no-email" }),
    error("invalidData"),
  );
  await assert.rejects(service.updateProfile({ ...profile, firstName: " " }), error("invalidData"));
  await assert.rejects(
    service.updateCompany({ ...company, website: "ftp://x" }),
    error("invalidData"),
  );
  await service.updateProfile(profile);
  await service.updateCompany(company);
  const users = await service.listUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].type, "agencyOwner");
  assert.equal(users[0].phone, "+503 0000 0000");
  assert.deepEqual((await service.get()).company, company);
});
test("corrupt account data is reported and never overwritten", async () => {
  const { service, raw } = fixture("{broken");
  await assert.rejects(service.get(), error("invalidData"));
  await assert.rejects(service.updateProfile(profile), error("invalidData"));
  assert.equal(raw(), "{broken");
});
test("password and session actions never pretend to succeed without an auth backend", async () => {
  const { service } = fixture();
  await assert.rejects(service.changePassword(), error("notConnected"));
  await assert.rejects(service.signOutEverywhere(), error("notConnected"));
});
test("demo sub-accounts start empty, reject duplicates and persist pins", async () => {
  const { service, storage } = fixture();
  assert.deepEqual(await service.listSubaccounts(), []);
  const item = await service.createSubaccount({ name: " Prueba ", snapshot: "blank" });
  assert.equal(item.name, "Prueba");
  assert.equal(item.address, null);
  await assert.rejects(
    service.createSubaccount({ name: "prueba", snapshot: "blank" }),
    error("duplicate"),
  );
  await assert.rejects(
    service.createSubaccount({ name: "Otra", snapshot: "invented" as "blank" }),
    error("invalidData"),
  );
  await service.setPinned(item.id, true);
  assert.equal((await new DemoAccountService(storage).listSubaccounts())[0].pinned, true);
});
test("stores written before sub-accounts existed still load", async () => {
  const legacy = JSON.stringify({
    version: 1,
    relationshipId: "DEMO-000-000",
    ownerId: "o",
    profile: null,
    company: null,
  });
  const { service } = fixture(legacy);
  assert.deepEqual(await service.listSubaccounts(), []);
});
