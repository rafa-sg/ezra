import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoProspectingService } from "../src/features/azra/prospecting/demo";
import {
  defaultProspectingSettings,
  ProspectingError,
  sectionIds,
} from "../src/features/azra/prospecting/model";
function fixture(initial: string | null = null) {
  let raw = initial;
  const storage = {
    read: () => raw,
    write: (value: string) => {
      raw = value;
    },
  };
  return { service: new DemoProspectingService(storage), raw: () => raw };
}
const error = (code: string) => (e: unknown) => e instanceof ProspectingError && e.code === code;
test("defaults match the references: every section on, three hosting providers selected", async () => {
  const { service } = fixture();
  const settings = await service.getSettings();
  assert.deepEqual(settings.order, [...sectionIds]);
  assert.deepEqual(settings.disabled, []);
  assert.deepEqual(settings.hosting, ["wordpress", "leadconnector", "leadconnectorAi"]);
});
test("reordered layout persists; incomplete or duplicate orders are rejected", async () => {
  const { service } = fixture();
  const base = defaultProspectingSettings();
  const order = [...base.order].reverse();
  await service.saveSettings({ ...base, order, disabled: ["listings", "listings"] });
  const saved = await service.getSettings();
  assert.deepEqual(saved.order, order);
  assert.deepEqual(saved.disabled, ["listings"]);
  await assert.rejects(
    service.saveSettings({ ...base, order: order.slice(1) }),
    error("invalidData"),
  );
  await assert.rejects(
    service.saveSettings({ ...base, order: [order[0], ...order.slice(0, -1)] }),
    error("invalidData"),
  );
});
test("corrupt settings are reported and analytics never fabricate activity", async () => {
  const { service, raw } = fixture("{bad");
  await assert.rejects(service.getSettings(), error("invalidData"));
  assert.equal(raw(), "{bad");
  assert.deepEqual(await service.getAnalytics(), {
    reports: 0,
    conversions: 0,
    leads: 0,
    views: 0,
  });
});
test("settings saved before heatmap defaults existed still load with 3 x 3 / 3 km", async () => {
  const legacy = JSON.stringify({
    version: 1,
    order: [...sectionIds],
    disabled: [],
    hosting: ["wordpress"],
    checklistSkipped: true,
  });
  const { service } = fixture(legacy);
  const settings = await service.getSettings();
  assert.equal(settings.heatmapGrid, 3);
  assert.equal(settings.heatmapCoverageKm, 3);
  await service.saveSettings({ ...settings, heatmapGrid: 7, heatmapCoverageKm: 10 });
  assert.equal((await service.getSettings()).heatmapGrid, 7);
});
