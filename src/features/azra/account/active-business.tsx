"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Business } from "@/lib/model";
import { listBusinesses } from "./businesses";

/** The business Ask AI works for. The list comes from the server, which only
 * returns businesses the signed-in account may see (admin: all; client: own). */
const STORAGE_KEY = "azra:activeBusiness";
type ActiveBusiness = {
  businesses: Business[] | null;
  active: Business | null;
  setActive: (id: string) => void;
  reload: () => void;
  failed: boolean;
};
const Context = createContext<ActiveBusiness>({
  businesses: null,
  active: null,
  setActive: () => {},
  reload: () => {},
  failed: false,
});
function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
export function ActiveBusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    listBusinesses()
      .then((list) => {
        setBusinesses(list);
        setFailed(false);
        setActiveId((current) => current ?? readStored());
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(reload, [reload]);
  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* Session-only choice when storage is unavailable. */
    }
  }, []);
  // A stored id that is no longer authorized falls back to the first allowed business.
  const active = businesses?.find((b) => b.id === activeId) ?? businesses?.[0] ?? null;
  return (
    <Context.Provider value={{ businesses, active, setActive, reload, failed }}>
      {children}
    </Context.Provider>
  );
}
export const useActiveBusiness = () => useContext(Context);
