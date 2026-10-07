"use client";
import { useCallback, useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import type { Account } from "@/lib/auth";
import { businessTypeLabels, type Business } from "@/lib/model";
import { Studio } from "./studio";
import { AccessScreen } from "./access-screen";
import { Dialog, Mark } from "./ui";

type EntryProps = { initialView?: string; initialBusiness?: string };
export function CommercialApp(props: EntryProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded)
    return (
      <main className="loading-state">
        <LoaderCircle className="spin" aria-label="Cargando acceso" />
      </main>
    );
  if (!isSignedIn) return <AccessScreen mode="sign-in" inline />;
  return <AuthenticatedApp key={user.id} {...props} />;
}

function AuthenticatedApp({ initialView, initialBusiness }: EntryProps) {
  const { signOut } = useClerk();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const onExpired = useCallback(() => {
    setAccount(null);
    setError("Tu sesión necesita verificarse de nuevo. Vuelve a iniciar sesión.");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!data.account) throw new Error("Vuelve a iniciar sesión para abrir tu panel.");
        setAccount(data.account);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const onLogout = async () => {
    await signOut({ redirectUrl: "/" });
  };
  if (account)
    return (
      <BusinessApp
        key={account.username}
        account={account}
        initialView={initialView}
        initialBusiness={initialBusiness}
        onLogout={onLogout}
        onExpired={onExpired}
      />
    );
  return (
    <main className="loading-state">
      <Mark />
      {error ? (
        <>
          <h1>Revisa tu acceso</h1>
          <p role="alert">{error}</p>
          <button className="button secondary" onClick={() => window.location.reload()}>
            Volver a intentar
          </button>
          <button
            className="text-button"
            onClick={() =>
              void onLogout().catch(() =>
                setError("No se pudo cerrar la sesión. Vuelve a intentar."),
              )
            }
          >
            Usar otro correo
          </button>
        </>
      ) : (
        <p role="status">Preparando tu panel…</p>
      )}
    </main>
  );
}
function BusinessApp({
  account,
  initialView,
  initialBusiness,
  onLogout,
  onExpired,
}: {
  account: Account;
  initialView?: string;
  initialBusiness?: string;
  onLogout: () => Promise<void>;
  onExpired: () => void;
}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/businesses", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          onExpired();
          return;
        }
        if (!res.ok) throw new Error(data.error);
        const list: Business[] = data.businesses;
        setBusinesses(list);
        setSelected(
          list.some((b) => b.id === initialBusiness)
            ? initialBusiness!
            : account.role === "admin"
              ? ""
              : list.find((b) => b.organizationId === account.organizationId)?.id || "",
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [account.organizationId, account.role, initialBusiness, onExpired]);
  useEffect(() => {
    const sync = () => {
      const id = new URLSearchParams(window.location.search).get("business");
      if (id && businesses.some((b) => b.id === id)) setSelected(id);
      else if (account.role === "admin") setSelected("");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [businesses, account.role]);
  const business = businesses.find((b) => b.id === selected);
  function switchBusiness(id: string) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("business", id);
    window.history.pushState(null, "", url);
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          type: form.get("type"),
          organizationId:
            account.role === "admin" ? form.get("organizationId") : account.organizationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBusinesses((list) => [...list, data.business]);
      switchBusiness(data.business.id);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el negocio.");
    } finally {
      setBusy(false);
    }
  }
  if (!loaded || (!business && account.role !== "admin"))
    return (
      <main className="loading-state">
        <Mark />
        <p>{error || "Preparando tus negocios…"}</p>
        <button className="button secondary" onClick={() => window.location.reload()}>
          Volver a intentar
        </button>
        <button
          className="text-button"
          onClick={() => void onLogout().catch((e) => setError(e.message))}
        >
          Cerrar sesión
        </button>
      </main>
    );
  return (
    <>
      {business ? (
        <Studio
          key={business.id}
          initialView={initialView}
          business={business}
          businesses={businesses}
          account={account}
          onBusinessChange={switchBusiness}
          onCreateBusiness={() => {
            setError("");
            setCreating(true);
          }}
          onLogout={onLogout}
          onExpired={onExpired}
          onOwnerPanel={() => window.location.assign("/azra/ai/chat")}
        />
      ) : (
        // «Mi panel» (OwnerDashboard) was replaced by the new admin panel; the
        // component is kept unused pending the owner's review.
        <AgencyRedirect />
      )}
      {creating && (
        <Dialog
          title="Crear negocio"
          subtitle="Su catálogo, publicaciones y archivos tendrán un espacio propio."
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form className="form-stack" onSubmit={create}>
            {account.role === "admin" && (
              <label>
                Cliente
                <select
                  name="organizationId"
                  defaultValue={business?.organizationId || "owner"}
                  disabled={busy}
                >
                  <option value="owner">Mi negocio</option>
                  <option value="sgmotos">Sgmotos</option>
                  <option value="motoxspress">motoxspress</option>
                </select>
              </label>
            )}
            <label>
              Nombre del negocio
              <input
                name="name"
                maxLength={120}
                required
                disabled={busy}
                placeholder="Ej. Sgmotos · Comida"
              />
            </label>
            <label>
              Tipo
              <select name="type" defaultValue="motorcycles" disabled={busy}>
                {Object.entries(businessTypeLabels)
                  .filter(([key]) => key !== "editorial")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-hint">
              Comida y rent a car pueden organizar contenido desde ahora. Los pedidos, las reservas
              y la atención automática se incorporarán después.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Guardando…" : "Crear negocio"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}

function AgencyRedirect() {
  useEffect(() => {
    window.location.replace("/azra/ai/chat");
  }, []);
  return (
    <main className="loading-state">
      <LoaderCircle className="spin" aria-label="Abriendo el panel de administración" />
    </main>
  );
}
