import { WorkflowError } from "../workflow";
import { leerGranja } from "./almacen";
import { ahoraIso, auditar, base, transaccion } from "./db";
import { sha256 } from "./huella";
import { canonico } from "./modelo";
import { leerMedio } from "./medios";
import { guideContentSchema, guideChecksSchema, guidePendingItems, type GuideContent, type GuideChecks, type GuideVersion } from "./guide-model";

type Row = { farm_id: string; version: number; content: string; hash: string; checks: string; approved_at: string | null; created_at: string };
function fromRow(row: Row): GuideVersion {
  return { farmId: row.farm_id, version: row.version, content: guideContentSchema.parse(JSON.parse(row.content)), hash: row.hash,
    checks: JSON.parse(row.checks), approvedAt: row.approved_at, createdAt: row.created_at };
}
export function readGuide(farmId: string, version?: number): GuideVersion | null {
  leerGranja(farmId);
  const row = (version === undefined
    ? base().prepare("select * from guide_versions where farm_id = ? order by version desc limit 1").get(farmId)
    : base().prepare("select * from guide_versions where farm_id = ? and version = ?").get(farmId, version)) as Row | undefined;
  return row ? fromRow(row) : null;
}
export function guideHistory(farmId: string) {
  leerGranja(farmId);
  return base().prepare("select version, approved_at as approvedAt, created_at as createdAt from guide_versions where farm_id = ? order by version desc").all(farmId);
}
function editable(farmId: string, expectedVersion: number) {
  if (leerGranja(farmId).estado === "archivada") throw new WorkflowError("Restaurá la granja antes de editar la guía.", 422);
  const current = readGuide(farmId);
  if ((current?.version ?? 0) !== expectedVersion) throw new WorkflowError("La guía cambió en otra ventana. Conservá tu texto y recargá la versión guardada.", 409);
  return current;
}
function validateCover(content: GuideContent) {
  if (!content.coverMediaId) return;
  const media = leerMedio(content.coverMediaId);
  if (!media.mime.startsWith("image/") || !media.licencia.trim())
    throw new WorkflowError("La portada necesita una imagen propia o con permiso registrado.", 422);
  if (media.bytes > 12 * 1024 * 1024) throw new WorkflowError("Usá una portada de hasta 12 MB.", 422);
}
export function saveGuide(farmId: string, expectedVersion: number, input: GuideContent) {
  const content = guideContentSchema.parse(input);
  validateCover(content);
  return transaccion((db) => {
    const current = editable(farmId, expectedVersion);
    const hash = sha256(canonico(content));
    if (current?.hash === hash) return current;
    const now = ahoraIso();
    db.prepare("insert into guide_versions (farm_id, version, content, hash, created_at) values (?, ?, ?, ?, ?)")
      .run(farmId, expectedVersion + 1, JSON.stringify(content), hash, now);
    db.prepare("update granjas set actualizado = ? where id = ?").run(now, farmId);
    auditar("guide.save", farmId, { version: expectedVersion + 1 });
    return readGuide(farmId)!;
  });
}
export function approveGuide(farmId: string, expectedVersion: number, hash: string, input: GuideChecks) {
  const checks = guideChecksSchema.parse(input);
  return transaccion((db) => {
    const current = editable(farmId, expectedVersion);
    if (!current || current.hash !== hash) throw new WorkflowError("La versión a revisar ya no coincide. Recargá la guía.", 409);
    if (!Object.values(checks).every(Boolean)) throw new WorkflowError("Confirmá hechos, permisos, marca y recorrido antes de aprobar.", 422);
    const pending = guidePendingItems(current.content);
    if (pending.length) throw new WorkflowError(pending.join(" "), 422);
    validateCover(current.content);
    db.prepare("update guide_versions set checks = ?, approved_at = ? where farm_id = ? and version = ?")
      .run(JSON.stringify(checks), ahoraIso(), farmId, expectedVersion);
    auditar("guide.approve", farmId, { version: expectedVersion, hash });
    return readGuide(farmId)!;
  });
}
