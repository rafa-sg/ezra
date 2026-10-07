import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoWorkflowService } from "../src/features/azra/workflows/service";
import { DemoAnnouncementService } from "../src/features/azra/announcements/service";
import { AnnouncementError } from "../src/features/azra/announcements/model";
import { DemoAccountService } from "../src/features/azra/account/demo";
import { AccountError } from "../src/features/azra/account/model";
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
test("workflow builder defaults to standard and stores per-sub-account overrides", async () => {
  const storage = memory();
  const service = new DemoWorkflowService(storage);
  const initial = await service.get();
  assert.equal(initial.defaultBuilder, "standard");
  await service.save({
    ...initial,
    defaultBuilder: "advanced",
    overrides: { "demo-1": "standard" },
  });
  const again = await new DemoWorkflowService(storage).get();
  assert.equal(again.defaultBuilder, "advanced");
  assert.equal(again.overrides["demo-1"], "standard");
  await assert.rejects(service.save({ ...again, defaultBuilder: "other" as "standard" }));
});
test("locked announcements cannot change; editable ones persist", async () => {
  const storage = memory();
  const service = new DemoAnnouncementService(storage);
  const items = await service.list();
  const locked = items.find((item) => item.locked)!;
  const editable = items.find((item) => !item.locked)!;
  await assert.rejects(
    service.setEnabled(locked.id, !locked.enabled),
    (e: unknown) => e instanceof AnnouncementError && e.code === "locked",
  );
  await service.setEnabled(editable.id, !editable.enabled);
  const after = await new DemoAnnouncementService(storage).list();
  assert.equal(after.find((item) => item.id === editable.id)!.enabled, !editable.enabled);
  assert.ok(!after.some((item) => item.id.startsWith("resell")));
});
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
