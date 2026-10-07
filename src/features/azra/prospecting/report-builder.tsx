"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Equal, Eye } from "lucide-react";
import { useLanguage } from "../i18n";
import { reportSections, type ItemId, type SectionId } from "./model";
import { ProspectingLayout, useProspectingSettings } from "./layout";

const byId = Object.fromEntries(reportSections.map((s) => [s.id, s])) as Record<
  SectionId,
  (typeof reportSections)[number]
>;
function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="az-check">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function ReportBuilder() {
  const { t } = useLanguage();
  const { settings, error, saved, save } = useProspectingSettings();
  const [dragging, setDragging] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const handles = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!settings)
    return (
      <ProspectingLayout active="prospecting/report-builder">
        <p className={error ? "az-error" : "az-muted"} role={error ? "alert" : undefined}>
          {t(error ?? "loading")}
        </p>
      </ProspectingLayout>
    );
  const off = new Set(settings.disabled);
  const editable = reportSections.flatMap((s) => [s.id, ...s.children]);
  const allOn = editable.every((id) => !off.has(id));
  const anyOn = editable.some((id) => !off.has(id));
  function setItems(ids: ItemId[], enabled: boolean) {
    const next = new Set(off);
    ids.forEach((id) => (enabled ? next.delete(id) : next.add(id)));
    save({ ...settings!, disabled: [...next] });
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= settings!.order.length || from === to) return;
    const order = [...settings!.order];
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    save({ ...settings!, order });
    setAnnouncement(`${t(item)}: ${to + 1}/${order.length}`);
    requestAnimationFrame(() => handles.current[item]?.focus());
  }
  function onHandleKey(event: KeyboardEvent, index: number) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, index + (event.key === "ArrowUp" ? -1 : 1));
    }
  }
  return (
    <ProspectingLayout active="prospecting/report-builder">
      <div className="az-card az-report-card">
        <div className="az-report-head">
          <div>
            <h2>{t("customizeLayout")}</h2>
            <p className="az-muted">{t("customizeLayoutDescription")}</p>
          </div>
          <button
            className="az-icon"
            aria-disabled="true"
            aria-label={t("previewReport")}
            title={t("outside")}
          >
            <Eye size={22} />
          </button>
        </div>
        <div className="az-report-body">
          {error && (
            <p className="az-error" role="alert">
              {t(error)}
            </p>
          )}
          <div className="az-report-list">
            <div className="az-report-all">
              <Checkbox
                label={t("all")}
                checked={allOn}
                indeterminate={anyOn && !allOn}
                onChange={(checked) => setItems(editable, checked)}
              />
            </div>
            <ol>
              {settings.order.map((id, index) => {
                const section = byId[id];
                const childrenOn = section.children.filter((c) => !off.has(c)).length;
                return (
                  <li
                    key={id}
                    className={dragging === index ? "is-dragging" : ""}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging !== null) move(dragging, index);
                      setDragging(null);
                    }}
                  >
                    <div className="az-report-row">
                      <Checkbox
                        label={t(id)}
                        checked={!off.has(id) && (section.children.length === 0 || childrenOn > 0)}
                        indeterminate={childrenOn > 0 && childrenOn < section.children.length}
                        onChange={(checked) => setItems([id, ...section.children], checked)}
                      />
                      <button
                        ref={(el) => {
                          handles.current[id] = el;
                        }}
                        className="az-icon az-drag"
                        draggable
                        onDragStart={() => setDragging(index)}
                        onDragEnd={() => setDragging(null)}
                        onKeyDown={(e) => onHandleKey(e, index)}
                        aria-label={`${t(id)}: ${t("moveSection")}`}
                        title={t("moveSection")}
                      >
                        <Equal size={20} />
                      </button>
                    </div>
                    {section.children.length > 0 && (
                      <ul className="az-report-children">
                        {section.children.map((child) => (
                          <li key={child}>
                            <Checkbox
                              label={t(child)}
                              checked={!off.has(child)}
                              onChange={(checked) =>
                                setItems(checked ? [child, id] : [child], checked)
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="az-muted az-report-status" role="status">
            {saved ? t("layoutSaved") : ""} {announcement}
          </p>
        </div>
      </div>
    </ProspectingLayout>
  );
}
