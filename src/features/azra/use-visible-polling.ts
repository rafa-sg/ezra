"use client";
import { useEffect } from "react";

/** Pausa en segundo plano y espera a terminar una lectura antes de programar la siguiente. */
export function useVisiblePolling(
  read: (signal: AbortSignal) => Promise<unknown>,
  interval: number | null,
) {
  useEffect(() => {
    if (interval === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = () => {
      if (!stopped && !document.hidden) timer = setTimeout(() => void tick(), interval);
    };
    const tick = async () => {
      if (stopped || document.hidden) return;
      controller = new AbortController();
      try {
        await read(controller.signal);
      } catch {
        /* Cada consumidor presenta su propio error. */
      } finally {
        controller = undefined;
        schedule();
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      // Una lectura ya en curso se conserva; nunca se solapa con otra al volver.
      if (!document.hidden && !controller) void tick();
    };
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [read, interval]);
}
