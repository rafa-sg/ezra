"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Aparece con fundido y desenfoque al entrar en pantalla (sin animación si se pide movimiento reducido). */
export function Aparece({ children, className = "", como: Etiqueta = "div" }: { children: ReactNode; className?: string; como?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return el.classList.add("ez-visible");
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas)
          if (e.isIntersecting) {
            e.target.classList.add("ez-visible");
            obs.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Etiqueta ref={ref} className={`ez-aparece ${className}`}>
      {children}
    </Etiqueta>
  );
}
