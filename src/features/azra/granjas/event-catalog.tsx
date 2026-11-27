"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { CalendarDays, MapPin, ExternalLink, Search } from "lucide-react";
import type { EventSummary } from "@/lib/event-summary";
import { Pagination, usePagination } from "../pagination";
import { catalogEvents, eventCover, eventSource } from "@/lib/event-catalog";
import "./event-catalog.css";

export function EventCover({
  src,
  title,
  category,
  fallback,
  label,
}: {
  src: string | null;
  title: string;
  category: string;
  fallback: string;
  label?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="ec-cover">
      {src && failed !== src ? (
        <img src={src} alt={title} loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <div className="ec-placeholder">
          <span>{category}</span>
          <strong>{title}</strong>
          <small>{fallback}</small>
        </div>
      )}
      {src && failed !== src && label && <span className="ec-image-label">{label}</span>}
    </div>
  );
}

export function EventCatalog({
  events,
  locale,
  g,
}: {
  events: EventSummary[];
  locale: string;
  g: (key: string) => string;
}) {
  const es = locale === "es";
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [free, setFree] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(
    new Date(),
  );
  const candidates = useMemo(() => catalogEvents(events, today), [events, today]);
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = candidates.filter(
    (e) =>
      normalize(`${e.titulo} ${e.lugar} ${e.municipio}`).includes(normalize(search)) &&
      (!department || e.departamento === department) &&
      (!category || e.categoria === category) &&
      (!free || e.precioDesde?.tipo === "gratis"),
  );
  const pagination = usePagination(visible, JSON.stringify([search, department, category, free, today]));
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(es ? "es-SV" : "en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return (
    <section
      className="ec-catalog"
      aria-label={es ? "Vista previa del catálogo" : "Catalog preview"}
    >
      <p className="ec-preview-note">
        {es
          ? "Vista previa local · Solo eventos aprobados y vigentes. No publica ni modifica Spotmi."
          : "Local preview · Approved, current events only. Does not publish or modify Spotmi."}
      </p>
      <header className="ec-heading">
        <span>spotmi · El Salvador</span>
        <h2>{es ? "Encontrá tu próximo plan" : "Find your next plan"}</h2>
        <p>
          {es
            ? "Explorá eventos y consultá los detalles en su fuente original."
            : "Discover events and check the details at their original source."}
        </p>
      </header>
      <div className="ec-filters">
        <label>
          <span>{es ? "Buscá un evento o lugar" : "Find an event or venue"}</span>
          <div className="ec-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={es ? "¿Qué te gustaría hacer?" : "What would you like to do?"}
            />
          </div>
        </label>
        <label>
          <span>{es ? "Departamento" : "Department"}</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">{es ? "Todos" : "All"}</option>
            {[...new Set(candidates.map((e) => e.departamento).filter(Boolean))].sort().map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{es ? "Categoría" : "Category"}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{es ? "Todas" : "All"}</option>
            {[...new Set(candidates.map((e) => e.categoria))].sort().map((c) => (
              <option key={c} value={c}>
                {g(`ev_cat_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="ec-free">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
          {es ? "Gratis" : "Free"}
        </label>
      </div>
      <p className="ec-count" role="status">
        {visible.length} {es ? "eventos para explorar" : "events to explore"}
      </p>
      {!visible.length && (
        <div className="ec-empty">
          <h3>
            {es ? "Todavía no hay eventos para esta selección" : "No events for this selection yet"}
          </h3>
          <p>
            {es
              ? "Cambiá los filtros o revisá y aprobá eventos en la bandeja."
              : "Change filters or review and approve events in the inbox."}
          </p>
        </div>
      )}
      <ul className="ec-grid">
        {pagination.items.map((e) => {
          const source = eventSource(e.fuenteUrl);
          return (
            <li key={e.id} className="ec-card">
              <EventCover
                src={eventCover(e, 480)}
                title={e.titulo}
                category={g(`ev_cat_${e.categoria}`)}
                fallback={es ? "Portada por confirmar" : "Cover pending"}
                label={
                  e.imagenTipo === "prensa" ? (es ? "Imagen de prensa" : "Press image") : undefined
                }
              />
              <div className="ec-body">
                <span className="ec-category">{g(`ev_cat_${e.categoria}`)}</span>
                <h3>{e.titulo}</h3>
                <p className="ec-meta">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>
                    {formatDate(e.fecha!)}
                    {e.fechaFin && e.fechaFin !== e.fecha ? ` – ${formatDate(e.fechaFin)}` : ""}
                    {e.hora ? ` · ${e.hora}` : ""}
                  </span>
                </p>
                <p className="ec-meta">
                  <MapPin size={16} aria-hidden="true" />
                  <span>
                    {[e.lugar, e.municipio || e.departamento].filter(Boolean).join(" · ") ||
                      (es ? "Lugar por confirmar" : "Venue pending")}
                  </span>
                </p>
                {e.descripcion && <p className="ec-description">{e.descripcion}</p>}
                <div className="ec-footer">
                  <strong>
                    {!e.precioDesde
                      ? es
                        ? "Precio por confirmar"
                        : "Price pending"
                      : e.precioDesde.tipo === "gratis"
                        ? es
                          ? "Gratis"
                          : "Free"
                        : `${es ? "Desde" : "From"} $${e.precioDesde.valor.toFixed(2)}`}
                  </strong>
                  {source ? (
                    <a href={source} target="_blank" rel="noopener noreferrer">
                      {es ? "Ver evento" : "View event"}
                      <ExternalLink size={15} aria-hidden="true" />
                      <span className="ec-sr">
                        {es ? ", abre otra pestaña" : ", opens a new tab"}
                      </span>
                    </a>
                  ) : (
                    <span>{es ? "Enlace por confirmar" : "Link pending"}</span>
                  )}
                </div>
                {source && (
                  <small className="ec-source">
                    {es ? "Información en" : "Information at"}{" "}
                    {new URL(source).hostname.replace(/^www\./, "")}
                  </small>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Pagination pagination={pagination} locale={locale} />
    </section>
  );
}
