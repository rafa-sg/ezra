"use client";
import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { ArrowRight, Building2, LogOut, Plus, ShieldCheck } from "lucide-react";
import type { Account } from "@/lib/auth";
import { businessApiUrl, type Business, type Workspace } from "@/lib/model";
import { Dialog, Mark } from "./ui";

type Counts = { products: number; posts: number; reviews: number };
export function OwnerDashboard({
  account,
  businesses,
  onOpen,
  onCreate,
  onLogout,
  onExpired,
}: {
  account: Account;
  businesses: Business[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onLogout: () => Promise<void>;
  onExpired: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<"sgmotos" | "motoxspress" | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/accounts", { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          onExpired();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setAccounts(data.accounts);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    Promise.all(
      businesses.map(async (business) => {
        const res = await fetch(businessApiUrl("/api/workspace", business.id), {
          signal: controller.signal,
        });
        if (res.status === 401) onExpired();
        if (!res.ok) throw new Error("No se pudieron cargar los conteos de los negocios.");
        const state: Workspace = await res.json();
        return [
          business.id,
          {
            products: state.catalog.length,
            posts: state.posts.length,
            reviews: state.posts.filter((p) => p.status === "review").length,
          },
        ] as const;
      }),
    )
      .then((entries) => setCounts(Object.fromEntries(entries)))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [businesses, onExpired]);
  const existing = accounts.find((a) => a.organizationId === editing);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: editing,
          email: form.get("email"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAccounts((list) => [...list.filter((a) => a.organizationId !== editing), data.account]);
      setEditing(null);
      setNotice("Acceso guardado. Ese correo abrirá únicamente el panel de su cliente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el acceso.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="owner-page">
      <header className="owner-header">
        <a className="wordmark" href="/">
          <Mark />
          <span>
            ezrá<span className="wordmark-dot">.</span>
          </span>
        </a>
        <div>
          <UserButton />
          <span className="muted">{account.email}</span>
          <button
            className="button secondary"
            onClick={() => void onLogout().catch((e) => setError(e.message))}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </header>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Mi panel</h1>
          <p>Gestiona tus negocios y los espacios de Sgmotos y motoxspress.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={17} />
          Crear negocio
        </button>
      </div>
      <div className="owner-businesses">
        {businesses.map((business) => (
          <button
            key={business.id}
            className="owner-business-card"
            onClick={() => onOpen(business.id)}
          >
            <span className="stat-icon lilac">
              <Building2 size={23} />
            </span>
            <span className="eyebrow">
              {business.organizationId === "owner" ? "MI ESPACIO" : business.organizationName}
            </span>
            <h2>{business.name}</h2>
            <p>
              {counts[business.id]
                ? `${counts[business.id].products} productos · ${counts[business.id].posts} publicaciones · ${counts[business.id].reviews} por revisar`
                : "Cargando información…"}
            </p>
            <span className="text-button">
              Abrir panel <ArrowRight size={16} />
            </span>
          </button>
        ))}
      </div>
      <section className="panel account-management">
        <div className="section-heading">
          <div>
            <h2>Accesos de tus clientes</h2>
            <p className="muted">Todos ingresan en la misma página con su correo y contraseña.</p>
          </div>
          <ShieldCheck size={24} />
        </div>
        {(["sgmotos", "motoxspress"] as const).map((organizationId) => {
          const client = accounts.find((a) => a.organizationId === organizationId);
          return (
            <div className="client-access-row" key={organizationId}>
              <div>
                <strong>{organizationId === "sgmotos" ? "Sgmotos" : "motoxspress"}</strong>
                <p>{client?.email || "Correo pendiente de asignar"}</p>
              </div>
              <span className={`badge ${client ? "status-approved" : "status-review"}`}>
                {client ? "Acceso configurado" : "Pendiente"}
              </span>
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(organizationId);
                  setError("");
                }}
              >
                {client ? "Editar acceso" : "Asignar correo"}
              </button>
            </div>
          );
        })}
        <p className="field-hint">
          Usa un correo distinto para cada persona. Se registra como acceso a ezrá; no se crea un
          buzón de correo ni se envía una invitación.
        </p>
      </section>
      {notice && (
        <p className="info-note" role="status">
          {notice}
        </p>
      )}
      {error && !editing && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="page-footer">
        <span>ezrá · Piloto local</span>
        <span>El Salvador</span>
      </footer>
      {editing && (
        <Dialog
          title={`${existing ? "Editar" : "Crear"} acceso de ${editing === "sgmotos" ? "Sgmotos" : "motoxspress"}`}
          subtitle="Este correo abrirá el panel de la comercial y sus negocios."
          onClose={() => {
            if (!saving) setEditing(null);
          }}
        >
          <form className="form-stack" onSubmit={save}>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="off"
                required
                disabled={saving}
                defaultValue={existing?.email || ""}
                placeholder="cliente@email.com"
              />
            </label>
            <p className="field-hint">
              El cliente crea su contraseña y verifica este correo al registrarse. Cambiar el correo
              retira el acceso al panel de la cuenta anterior.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar acceso"}
            </button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
