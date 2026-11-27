import type { EventSummary } from "@/lib/event-summary";

/** List data is a read-only preview; review actions require the complete, fresh detail. */
export function EventDetailPreview({ event, when, loading }: { event?: EventSummary; when: string; loading: string }) {
  return (
    <div className="eg-panel-evento" aria-busy="true">
      {event && (
        <>
          <h2 className="eg-panel-titulo">{event.titulo}</h2>
          {when && <p>{when}</p>}
          <p>{[event.lugar, event.municipio, event.departamento].filter(Boolean).join(", ")}</p>
          {event.descripcion && <p>{event.descripcion}</p>}
        </>
      )}
      <p role="status">{loading}</p>
    </div>
  );
}
