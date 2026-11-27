"use client";
import { useState } from "react";

/** Acota el DOM y conserva la búsqueda sobre todos los resultados, incluido el historial. */
export function usePagination<T>(items: readonly T[], key: string, pageSize = 50) {
  const [selection, setSelection] = useState({ key, page: 0 });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.key === key ? Math.min(selection.page, pages - 1) : 0;
  return {
    items: items.slice(page * pageSize, (page + 1) * pageSize),
    total: items.length,
    page,
    pages,
    from: items.length ? page * pageSize + 1 : 0,
    to: Math.min((page + 1) * pageSize, items.length),
    go: (next: number) => setSelection({ key, page: Math.max(0, Math.min(next, pages - 1)) }),
  };
}

export function Pagination({
  pagination: p,
  locale,
}: {
  pagination: Omit<ReturnType<typeof usePagination>, "items">;
  locale: string;
}) {
  if (p.pages <= 1) return null;
  const es = locale === "es";
  return (
    <nav
      aria-label={es ? "Páginas de eventos" : "Event pages"}
      style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBlock: 16 }}
    >
      <button
        type="button"
        className="ep-boton"
        disabled={p.page === 0}
        onClick={() => p.go(p.page - 1)}
      >
        {es ? "Anterior" : "Previous"}
      </button>
      <span role="status">
        {p.from}–{p.to} {es ? "de" : "of"} {p.total}
      </span>
      <button
        type="button"
        className="ep-boton"
        disabled={p.page === p.pages - 1}
        onClick={() => p.go(p.page + 1)}
      >
        {es ? "Siguiente" : "Next"}
      </button>
    </nav>
  );
}
