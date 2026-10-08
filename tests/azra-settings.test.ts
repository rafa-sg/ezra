import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoAccountService } from "../src/features/azra/account/demo";
import { AccountError } from "../src/features/azra/account/model";
import es from "../src/features/azra/messages/es.json";
import en from "../src/features/azra/messages/en.json";
function memory(initial: string | null = null) {
  let raw = initial;
  return {
    read: () => raw,
    write: (value: string) => {
      raw = value;
    },
    raw: () => raw,
  };
}
test("company settings validate domains/URLs, default safely and load legacy stores", async () => {
  const legacy = JSON.stringify({
    version: 1,
    relationshipId: "DEMO-000-000",
    ownerId: "o",
    profile: null,
    company: null,
  });
  const service = new DemoAccountService(memory(legacy));
  const settings = await service.getCompanySettings();
  assert.equal(settings.address, null);
  assert.equal(settings.advanced.enhancedSecurity, true);
  assert.equal(settings.advanced.supportAccessUntil, null);
  assert.equal(settings.whiteLabel.theme, "light");
  const bad = {
    ...settings,
    whiteLabel: { ...settings.whiteLabel, whiteLabelDomain: "not a domain" },
  };
  await assert.rejects(service.saveCompanySettings(bad), (e: unknown) => e instanceof AccountError);
  const good = {
    ...settings,
    whiteLabel: {
      ...settings.whiteLabel,
      whiteLabelDomain: "app.example.com",
      privacyUrl: "https://example.com/p",
    },
    address: {
      street: "Calle 1",
      city: "San Salvador",
      postalCode: "01101",
      region: "San Salvador",
      country: "SV" as const,
      timezone: "America/El_Salvador",
    },
  };
  await service.saveCompanySettings(good);
  assert.deepEqual((await service.getCompanySettings()).address, good.address);
});

test("Spanish and English cover identical interface keys", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
});
