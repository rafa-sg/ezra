"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { botSchema, type Bot } from "@/lib/bot/model";
import { currentConnections, type Connections } from "@/lib/bot/connections";
import type { Operation, OperationResult } from "@/lib/bot/operations";

/** Server-backed state of the active business's bot. Every change goes through
 * /api/bot with the current revision; nothing is kept only in the browser. */
type BotData = {
  businessId: string;
  bot: Bot | null;
  connections: Connections;
  loadError: string;
  busy: boolean;
  run: (operation: Operation) => Promise<OperationResult | null>;
  error: string;
  notice: string;
  clearMessages: () => void;
  reload: () => void;
};
const Context = createContext<BotData | null>(null);
export function useBot() {
  const value = useContext(Context);
  if (!value) throw new Error("useBot outside BotProvider");
  return value;
}
const endpoint = (businessId: string) => `/api/bot?business=${encodeURIComponent(businessId)}`;
async function json(response: Response) {
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    /* handled below */
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "No se pudo completar la acción."), {
      status: response.status,
    });
  return data;
}
export function BotProvider({ businessId, children }: { businessId: string; children: ReactNode }) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [connections, setConnections] = useState<Connections>(currentConnections());
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint(businessId), { signal: controller.signal, cache: "no-store" })
      .then(json)
      .then((data) => {
        setBot(botSchema.parse(data.bot));
        setConnections(data.connections as Connections);
        setLoadError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setLoadError(e.message || "No pudimos cargar el bot. Recargá la página.");
      });
    return () => controller.abort();
  }, [businessId, version]);
  const run = useCallback(
    async (operation: Operation) => {
      if (!bot) return null;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const data = await json(
          await fetch(endpoint(businessId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...operation, revision: bot.revision }),
          }),
        );
        setBot(botSchema.parse(data.bot));
        setNotice("Cambios guardados");
        return (data.result as OperationResult) ?? {};
      } catch (e) {
        const failure = e as Error & { status?: number };
        setError(failure.message);
        if (failure.status === 409) reload();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [bot, businessId, reload],
  );
  return (
    <Context.Provider
      value={{
        businessId,
        bot,
        connections,
        loadError,
        busy,
        run,
        error,
        notice,
        clearMessages: () => {
          setError("");
          setNotice("");
        },
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
