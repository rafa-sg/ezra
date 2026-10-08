import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoAccountService } from "../src/features/azra/account/demo";
import {
  AccountError,
  companySchema,
  type Company,
  type Profile,
} from "../src/features/azra/account/model";
import { categories, nichesFor } from "../src/features/azra/account/catalog";
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
  audience: "own_business",
  audienceDetail: "",
  primaryGoal: "create_content",
  primaryGoalDetail: "",
  category: "vehicles",
  categoryDetail: "",
  niche: "motorcycle_sales",
  nicheDetail: "",
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

test("older company records load: «Creativo» and the old main use are mapped, not discarded", async () => {
  const legacy = JSON.stringify({
    version: 1,
    relationshipId: "DEMO-000-000",
    ownerId: "o",
    profile: null,
    company: {
      name: "Estudio",
      email: "estudio@example.com",
      phone: { country: "SV", number: "" },
      website: "",
      category: "creative",
      niche: "",
      primaryUse: "other",
      primaryUseDetail: "Portafolio",
    },
  });
  const { service } = fixture(legacy);
  const loaded = (await service.get()).company!;
  assert.equal(loaded.category, "arts_design");
  assert.equal(loaded.primaryGoal, "other");
  assert.equal(loaded.primaryGoalDetail, "Portafolio");
  // Unknown before: the audience is left for the user to choose, never invented.
  assert.equal(loaded.audience, "");
  assert.ok(!("primaryUse" in loaded));
  // Saving it requires the new questions.
  const issues = companySchema.safeParse(loaded).error!.issues.map((i) => `${i.path}:${i.message}`);
  assert.deepEqual(issues, ["audience:errorRequired", "niche:errorRequired"]);
});

test("company validation: «Otro» details, personal use and category-dependent niches", () => {
  const check = (patch: Partial<Company>) => {
    const result = companySchema.safeParse({ ...company, ...patch });
    return result.success ? [] : result.error.issues.map((i) => `${i.path}:${i.message}`);
  };
  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ audience: "other" }), ["audienceDetail:errorOtherDetail"]);
  assert.deepEqual(check({ audience: "other", audienceDetail: "Mi club" }), []);
  assert.deepEqual(check({ primaryGoal: "other" }), ["primaryGoalDetail:errorOtherDetail"]);
  assert.deepEqual(check({ category: "other", niche: "" }), ["categoryDetail:errorOtherDetail"]);
  assert.deepEqual(check({ niche: "other" }), ["nicheDetail:errorOtherDetail"]);
  // A niche from another category is rejected.
  assert.deepEqual(check({ niche: "restaurant" }), ["niche:errorNicheInvalid"]);
  assert.deepEqual(check({ category: "", niche: "" }), ["category:errorRequired"]);
  // Personal use needs no business classification; «No aplica» is valid there.
  assert.deepEqual(check({ audience: "own_social", category: "", niche: "" }), []);
  assert.deepEqual(check({ category: "personal", niche: "" }), []);
  assert.deepEqual(check({ category: "personal", niche: "not_applicable" }), []);
  // Details are kept only while «Otro» is selected.
  const saved = companySchema.parse({ ...company, audienceDetail: "sobrante", nicheDetail: "x" });
  assert.equal(saved.audienceDetail, "");
  assert.equal(saved.nicheDetail, "");
});

test("the niche catalog covers every category and ends with «Otro»", () => {
  assert.equal(categories.length, 17);
  for (const category of categories) {
    const niches = nichesFor(category.id);
    if (category.id === "other") assert.deepEqual(niches, []);
    else {
      assert.ok(niches.length >= 4, category.id);
      assert.equal(niches.at(-1)!.id, "other");
      assert.equal(new Set(niches.map((n) => n.id)).size, niches.length, category.id);
    }
  }
});
