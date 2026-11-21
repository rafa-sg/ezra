"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { Trazabilidad } from "@/lib/granjas/trazabilidad";
import { GEOGRAFIA } from "@/lib/granjas/geografia-sv";
import { MapaProcedencia, nombresCanal, type Metrica, type Seleccion } from "./mapa-procedencia";
import "./trazabilidad.css";
import { SourceDirectory } from "./source-directory";

type Tr = (c: string) => string;
type Datos = Trazabilidad & { leido: string };
type Evento = Datos["eventos"][number];
type Filtros = {
  departamento: string;
  fuente: string;
  estado: string;
  destino: string;
  desde: string;
  hasta: string;
  tipoFecha: "evento" | "descubrimiento" | "publicacion";
};
const filtrosVacios: Filtros = {
  departamento: "",
  fuente: "",
  estado: "",
  destino: "",
  desde: "",
  hasta: "",
  tipoFecha: "evento",
};
const CLAVE_FILTROS = "ezra:trazabilidad-filtros";
const numero = new Intl.NumberFormat("es-SV");

const nombresDepartamentos = Object.values(GEOGRAFIA)
  .map((d) => d.nombre)
  .sort((a, b) => a.localeCompare(b, "es"));

function leerFiltros(): Filtros {
  try {
    return {
      ...filtrosVacios,
      ...JSON.parse(window.sessionStorage.getItem(CLAVE_FILTROS) ?? "{}"),
    };
  } catch {
    return filtrosVacios;
  }
}

/**
 * Datos y conexiones: «Geografía» (eventos por departamento) y «Trazabilidad» (fuente → evento →
 * contenido → destino), con filtros y selección compartidos. Todo sale de la API de trazabilidad.
 */
export function DatosYConexiones({ tr, fecha }: { tr: Tr; fecha: (iso: string) => string }) {
  const [pestana, setPestana] = useState<"geografia" | "trazabilidad">("geografia");
  const [filtros, setFiltrosEstado] = useState<Filtros>(filtrosVacios);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [metrica, setMetrica] = useState<Metrica>("eventos");
  const [recarga, setRecarga] = useState(0);
  // Los filtros sobreviven a abrir otra sección y volver (por pestaña del navegador).
  useEffect(() => {
    const guardados = leerFiltros();
    queueMicrotask(() => setFiltrosEstado(guardados));
  }, []);
  const setFiltros = (f: Filtros) => {
    setFiltrosEstado(f);
    setSeleccion(null);
    try {
      window.sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify(f));
    } catch {
      /* sin almacenamiento: los filtros duran solo esta vista */
    }
  };
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v) as [string, string][],
    );
    queueMicrotask(() => vivo && setCargando(true));
    fetch(`/api/granjas/trazabilidad?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: string }).error ?? "Error");
        if (vivo) {
          setDatos(j as Datos);
          setError("");
        }
      })
      .catch((e) => vivo && setError((e as Error).message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [filtros, recarga]);
  const activos = Object.entries(filtros).filter(([k, v]) => v && k !== "tipoFecha").length;
  return (
    <section className="ez-dc" aria-labelledby="ez-dc-titulo">
      <h2 id="ez-dc-titulo" className="ez-oculto">
        {tr("ez_mp_titulo")}
      </h2>
      {error && (
        <p className="ep-alerta" role="alert">
          {error} <button onClick={() => setRecarga((x) => x + 1)}>{tr("p_reintentar")}</button>
        </p>
      )}
      {/* El mapa se muestra desde el primer momento (el país no depende de los datos); los totales
          reservan su lugar mientras cargan. */}
      <div id={`ez-dc-${pestana}`} role="tabpanel" className="ez-dc-vista">
        {pestana === "geografia" ? (
          <MapaProcedencia
            datos={datos}
            cargando={cargando}
            tr={tr}
            metrica={metrica}
            seleccion={seleccion}
            setSeleccion={setSeleccion}
          />
        ) : datos ? (
          <Traza datos={datos} tr={tr} seleccion={seleccion} setSeleccion={setSeleccion} />
        ) : (
          <p role="status">{tr("p_cargando")}</p>
        )}
      </div>
      {/* Controles debajo del mapa: arriba solo el mapa con ezrá y sus conexiones. */}
      <div className="ez-dc-barra">
        <div className="ez-segmentado" role="tablist" aria-label={tr("ez_dc_vistas")}>
          {(["geografia", "trazabilidad"] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={pestana === p}
              aria-controls={`ez-dc-${p}`}
              onClick={() => setPestana(p)}
            >
              {tr(`ez_dc_${p}`)}
            </button>
          ))}
        </div>
        {pestana === "geografia" && (
          <div className="ez-segmentado" role="radiogroup" aria-label={tr("ez_dc_metrica")}>
            {(["eventos", "contenidos"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={metrica === m}
                onClick={() => setMetrica(m)}
              >
                {tr(`ez_dc_m_${m}`)}
              </button>
            ))}
          </div>
        )}
        <p className="ez-dc-sub">
          {datos ? `${tr("ez_dc_actualizado")} ${fecha(datos.leido)}` : ""}
          {`${datos ? " · " : ""}${tr("ez_dc_filtraPor")} ${tr(`ez_dc_fecha_${filtros.tipoFecha}`).toLowerCase()}`}
          {activos > 0 && ` · ${tr("ez_dc_filtros")}: ${activos}`}
          {cargando && ` · ${tr("p_cargando")}`}
        </p>
      </div>

      {datos && seleccion && (
        <PanelDetalle
          datos={datos}
          seleccion={seleccion}
          setSeleccion={setSeleccion}
          tr={tr}
          fecha={fecha}
        />
      )}
      {datos ? <TotalesDatos datos={datos} tr={tr} /> : <TotalesReservados tr={tr} />}
      {pestana === "geografia" && (
        <details className="ez-dc-leyenda">
          <summary>{tr("ez_mp_comoLeer")}</summary>
          <p>
            {tr(metrica === "eventos" ? "ez_dc_leyendaEventos" : "ez_dc_leyendaContenidos")}{" "}
            {tr("ez_dc_leyendaAgregado")} {tr("ez_dc_pulsosReales")} {tr("ez_dc_explicaConteo")}{" "}
            {tr("ez_dc_atribucion")}
          </p>
        </details>
      )}
      <div className="ez-dc-extras">
        <SourceDirectory />
        <details className="ez-map-filters" open={activos > 0 || undefined}>
          <summary>
            {tr("ez_dc_filtros")}
            {activos ? ` · ${activos}` : ""}
          </summary>
          <Filtros
            datos={datos}
            filtros={filtros}
            setFiltros={setFiltros}
            tr={tr}
            activos={activos}
          />
        </details>
      </div>
    </section>
  );
}

/** Lugar reservado para los totales mientras llegan los datos (la página no salta). */
function TotalesReservados({ tr }: { tr: Tr }) {
  // Mismas etiquetas y misma tipografía que los totales reales: el alto coincide al llegar los datos.
  return (
    <dl className="ez-dc-totales ez-dc-totales-cargando" aria-hidden="true">
      {["ez_dc_t_eventos", "ez_dc_t_relaciones", "ez_dc_t_contenidos", "ez_dc_t_entregas"].map(
        (k) => (
          <div key={k}>
            <dt>{tr(k)}</dt>
            <dd>
              <span>00</span>
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

/** Totales del bloque (resumen secundario, debajo del mapa). */
function TotalesDatos({ datos, tr }: { datos: Trazabilidad; tr: Tr }) {
  return (
    <dl className="ez-dc-totales">
      <div>
        <dt>{tr("ez_dc_t_eventos")}</dt>
        <dd>{numero.format(datos.totales.eventos)}</dd>
      </div>
      <div>
        <dt>{tr("ez_dc_t_relaciones")}</dt>
        <dd>{numero.format(datos.totales.relacionesProcedencia)}</dd>
      </div>
      <div>
        <dt>{tr("ez_dc_t_contenidos")}</dt>
        <dd>{numero.format(datos.totales.contenidos)}</dd>
      </div>
      <div>
        <dt>{tr("ez_dc_t_entregas")}</dt>
        <dd>{numero.format(datos.totales.entregasRealizadas)}</dd>
      </div>
    </dl>
  );
}

function Filtros({
  datos,
  filtros,
  setFiltros,
  tr,
  activos,
}: {
  datos: Datos | null;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  tr: Tr;
  activos: number;
}) {
  const cambiar = (k: keyof Filtros, v: string) => setFiltros({ ...filtros, [k]: v });
  return (
    <div className="ez-dc-filtros" role="group" aria-label={tr("ez_dc_filtros")}>
      <label>
        {tr("ez_dc_f_departamento")}
        <select
          value={filtros.departamento}
          onChange={(e) => cambiar("departamento", e.target.value)}
        >
          <option value="">{tr("ez_dc_todos")}</option>
          {nombresDepartamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          <option value="sin_ubicacion">{tr("ez_mapa_sinUbicacion")}</option>
        </select>
      </label>
      <label>
        {tr("ez_dc_f_fuente")}
        <select value={filtros.fuente} onChange={(e) => cambiar("fuente", e.target.value)}>
          <option value="">{tr("ez_dc_todas")}</option>
          {(datos?.fuentes ?? []).map((f) => (
            <option key={f.clave} value={f.clave}>
              {f.etiqueta}
            </option>
          ))}
          {filtros.fuente && !datos?.fuentes.some((f) => f.clave === filtros.fuente) && (
            <option value={filtros.fuente}>{filtros.fuente}</option>
          )}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_estado")}
        <select value={filtros.estado} onChange={(e) => cambiar("estado", e.target.value)}>
          <option value="">{tr("ez_dc_todos")}</option>
          {["nuevo", "aprobado", "descartado"].map((s) => (
            <option key={s} value={s}>
              {tr(`ez_evest_${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_destino")}
        <select value={filtros.destino} onChange={(e) => cambiar("destino", e.target.value)}>
          <option value="">{tr("ez_dc_todos")}</option>
          {["spotmi", "instagram", "tiktok", "facebook"].map((c) => (
            <option key={c} value={c}>
              {nombresCanal[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_fecha")}
        <select value={filtros.tipoFecha} onChange={(e) => cambiar("tipoFecha", e.target.value)}>
          {(["evento", "descubrimiento", "publicacion"] as const).map((t) => (
            <option key={t} value={t}>
              {tr(`ez_dc_fecha_${t}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("ez_dc_f_desde")}
        <input
          type="date"
          value={filtros.desde}
          onChange={(e) => cambiar("desde", e.target.value)}
        />
      </label>
      <label>
        {tr("ez_dc_f_hasta")}
        <input
          type="date"
          value={filtros.hasta}
          onChange={(e) => cambiar("hasta", e.target.value)}
        />
      </label>
      {activos > 0 && (
        <button
          className="ez-boton-blanco"
          onClick={() => setFiltros({ ...filtrosVacios, tipoFecha: filtros.tipoFecha })}
        >
          <X size={14} aria-hidden="true" /> {tr("ez_dc_limpiar")} ({activos})
        </button>
      )}
    </div>
  );
}

/* ── Trazabilidad (nodos y conexiones agrupados; el detalle se despliega al seleccionar) ── */
type Nodo = {
  id: string;
  columna: 0 | 1 | 2 | 3;
  etiqueta: string;
  valor: number;
  estado?: "error" | "pendiente" | "ok";
};
type Arista = { desde: string; hasta: string; valor: number; realizada: boolean; error?: boolean };
function grafo(datos: Datos, tr: Tr) {
  const nodos: Nodo[] = [];
  const aristas = new Map<string, Arista>();
  const sumar = (desde: string, hasta: string, realizada = false, error = false) => {
    const k = `${desde}>${hasta}`;
    const a = aristas.get(k) ?? { desde, hasta, valor: 0, realizada, error };
    a.valor++;
    a.realizada = a.realizada || realizada;
    a.error = a.error || error;
    aristas.set(k, a);
  };
  for (const f of datos.fuentes)
    nodos.push({ id: `f:${f.clave}`, columna: 0, etiqueta: f.etiqueta, valor: f.eventos });
  const grupos = ["nuevo", "aprobado", "descartado"];
  for (const g of grupos) {
    const n = datos.eventos.filter((e) => e.estado === g).length;
    if (n)
      nodos.push({
        id: `e:${g}`,
        columna: 1,
        etiqueta: `${tr(`ez_dc_eventos_${g}`)}`,
        valor: n,
        estado: datos.eventos.some(
          (e) =>
            e.estado === g &&
            e.ejecucion?.pasos.some((p) => p.estado === "fallido" || p.estado === "bloqueado"),
        )
          ? "error"
          : undefined,
      });
  }
  for (const e of datos.eventos)
    for (const r of new Set(e.registros.map((x) => x.clave))) sumar(`f:${r}`, `e:${e.estado}`);
  const tiposC = ["post_ig", "encargo"] as const;
  for (const t of tiposC) {
    const n = datos.contenidos.filter((c) => c.tipo === t).length;
    if (n) nodos.push({ id: `c:${t}`, columna: 2, etiqueta: tr(`ez_dc_contenido_${t}`), valor: n });
  }
  for (const c of datos.contenidos)
    for (const id of c.eventos) {
      const e = datos.eventos.find((x) => x.id === id);
      if (e) sumar(`e:${e.estado}`, `c:${c.tipo}`);
    }
  const destinos = new Map<
    string,
    { n: number; realizadas: number; error: boolean; pendiente: boolean }
  >();
  const anotar = (canal: string, estado: string, realizado: boolean) => {
    const d = destinos.get(canal) ?? { n: 0, realizadas: 0, error: false, pendiente: false };
    d.n++;
    if (realizado) d.realizadas++;
    if (estado === "envio_sin_confirmar") d.error = true;
    if (estado === "pendiente_subida_manual" || estado === "lista_para_descargar")
      d.pendiente = true;
    destinos.set(canal, d);
  };
  for (const c of datos.contenidos)
    for (const d of c.destinos)
      if (d.estado !== "no_enviado") {
        anotar(d.canal, d.estado, d.realizado);
        sumar(`c:${c.tipo}`, `d:${d.canal}`, d.realizado, d.estado === "envio_sin_confirmar");
      }
  for (const e of datos.eventos)
    if (e.spotmi.estado !== "no_enviado") {
      anotar("spotmi", e.spotmi.estado, e.spotmi.realizado);
      sumar(
        `e:${e.estado}`,
        "d:spotmi",
        e.spotmi.realizado,
        e.spotmi.estado === "envio_sin_confirmar",
      );
    }
  for (const [canal, d] of destinos)
    nodos.push({
      id: `d:${canal}`,
      columna: 3,
      etiqueta: nombresCanal[canal] ?? canal,
      valor: d.n,
      estado: d.error ? "error" : d.pendiente ? "pendiente" : "ok",
    });
  return { nodos, aristas: [...aristas.values()] };
}
function Traza({
  datos,
  tr,
  seleccion,
  setSeleccion,
}: {
  datos: Datos;
  tr: Tr;
  seleccion: Seleccion;
  setSeleccion: (s: Seleccion) => void;
}) {
  const { nodos, aristas } = useMemo(() => grafo(datos, tr), [datos, tr]);
  const [vista, setVista] = useState({ x: 0, y: 0, z: 1 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const ancho = 980;
  const porCol = [0, 1, 2, 3].map((c) => nodos.filter((n) => n.columna === c));
  const alto = Math.max(320, 70 + Math.max(...porCol.map((c) => c.length)) * 64);
  const pos = new Map<string, [number, number]>();
  porCol.forEach((col, c) =>
    col.forEach((n, i) =>
      pos.set(n.id, [
        70 + c * ((ancho - 260) / 3),
        60 + i * 64 + (alto - 60 - col.length * 64) / 2,
      ]),
    ),
  );
  // Qué se resalta: una fuente → sus eventos y lo que salió de ellos; un contenido → sus eventos y fuentes.
  const resaltados = new Set<string>();
  if (seleccion?.tipo === "fuente") {
    const evs = datos.eventos.filter((e) => e.registros.some((r) => r.clave === seleccion.clave));
    resaltados.add(`f:${seleccion.clave}`);
    for (const e of evs) {
      resaltados.add(`e:${e.estado}`);
      for (const cid of e.contenidos) {
        const c = datos.contenidos.find((x) => x.id === cid);
        if (c) {
          resaltados.add(`c:${c.tipo}`);
          c.destinos
            .filter((d) => d.estado !== "no_enviado")
            .forEach((d) => resaltados.add(`d:${d.canal}`));
        }
      }
      if (e.spotmi.estado !== "no_enviado") resaltados.add("d:spotmi");
    }
  }
  if (seleccion?.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    if (c) {
      resaltados.add(`c:${c.tipo}`);
      for (const id of c.eventos) {
        const e = datos.eventos.find((x) => x.id === id);
        if (e) {
          resaltados.add(`e:${e.estado}`);
          e.registros.forEach((r) => resaltados.add(`f:${r.clave}`));
        }
      }
      c.destinos
        .filter((d) => d.estado !== "no_enviado")
        .forEach((d) => resaltados.add(`d:${d.canal}`));
    }
  }
  const atenuar = resaltados.size > 0;
  const zoom = (f: number) => setVista((v) => ({ ...v, z: Math.min(3, Math.max(0.5, v.z * f)) }));
  if (!nodos.length) return <p className="ez-vacio">{tr("ez_dc_sinDatos")}</p>;
  return (
    <div className="ez-traza">
      <div className="ez-traza-controles">
        <button
          className="ez-boton-blanco"
          onClick={() => zoom(1.2)}
          aria-label={tr("ez_dc_acercar")}
        >
          <Plus size={15} />
        </button>
        <button
          className="ez-boton-blanco"
          onClick={() => zoom(1 / 1.2)}
          aria-label={tr("ez_dc_alejar")}
        >
          <Minus size={15} />
        </button>
        <button className="ez-boton-blanco" onClick={() => setVista({ x: 0, y: 0, z: 1 })}>
          <RotateCcw size={14} aria-hidden="true" /> {tr("ez_dc_restablecer")}
        </button>
        <span className="ez-traza-leyenda">
          <i className="ez-l-dato" /> {tr("ez_dc_relacionDatos")}
          <i className="ez-l-real" /> {tr("ez_dc_transferencia")}
          <i className="ez-l-error" /> {tr("ez_dc_errorPendiente")}
        </span>
      </div>
      <div
        className="ez-traza-lienzo"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-nodo],[data-arista]")) return;
          arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (a)
            setVista((v) => ({ ...v, x: a.vx + (e.clientX - a.x), y: a.vy + (e.clientY - a.y) }));
        }}
        onPointerUp={() => (arrastre.current = null)}
      >
        <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={tr("ez_dc_trazaAlt")}>
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.z})`}>
            {[
              "ez_dc_col_fuentes",
              "ez_dc_col_eventos",
              "ez_dc_col_contenidos",
              "ez_dc_col_destinos",
            ].map((c, i) => (
              <text key={c} x={70 + i * ((ancho - 260) / 3)} y={28} className="ez-traza-col">
                {tr(c)}
              </text>
            ))}
            {aristas.map((a) => {
              const p1 = pos.get(a.desde);
              const p2 = pos.get(a.hasta);
              if (!p1 || !p2) return null;
              const x1 = p1[0] + 170;
              const x2 = p2[0];
              const activa = !atenuar || (resaltados.has(a.desde) && resaltados.has(a.hasta));
              const elegida =
                seleccion?.tipo === "conexion" &&
                seleccion.desde === a.desde &&
                seleccion.hasta === a.hasta;
              return (
                <g
                  key={`${a.desde}>${a.hasta}`}
                  data-arista=""
                  className={`ez-arista ${a.realizada ? "ez-real" : "ez-dato"} ${a.error ? "ez-error" : ""} ${activa ? "" : "ez-atenuado"} ${elegida ? "ez-elegida" : ""}`}
                  onClick={() => setSeleccion({ tipo: "conexion", desde: a.desde, hasta: a.hasta })}
                >
                  <path
                    d={`M${x1},${p1[1]} C${(x1 + x2) / 2},${p1[1]} ${(x1 + x2) / 2},${p2[1]} ${x2},${p2[1]}`}
                    strokeWidth={Math.min(10, 1.5 + Math.sqrt(a.valor) * 1.4)}
                  />
                  <path
                    className="ez-arista-toque"
                    d={`M${x1},${p1[1]} C${(x1 + x2) / 2},${p1[1]} ${(x1 + x2) / 2},${p2[1]} ${x2},${p2[1]}`}
                  />
                  <text x={(x1 + x2) / 2} y={(p1[1] + p2[1]) / 2 - 6} textAnchor="middle">
                    {a.valor}
                  </text>
                </g>
              );
            })}
            {nodos.map((n) => {
              const [x, y] = pos.get(n.id)!;
              const activo = !atenuar || resaltados.has(n.id);
              return (
                <g
                  key={n.id}
                  data-nodo=""
                  className={`ez-nodo-t ${n.estado ? `ez-nodo-${n.estado}` : ""} ${activo ? "" : "ez-atenuado"}`}
                  transform={`translate(${x} ${y - 22})`}
                  onClick={() => {
                    if (n.id.startsWith("f:"))
                      setSeleccion({ tipo: "fuente", clave: n.id.slice(2) });
                    else if (n.id.startsWith("e:"))
                      setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                    else if (n.id.startsWith("c:"))
                      setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                    else setSeleccion({ tipo: "conexion", desde: n.id, hasta: n.id });
                  }}
                >
                  <rect width="170" height="44" rx="12" />
                  <text x="14" y="19" className="ez-nodo-t-titulo">
                    {n.etiqueta.length > 22 ? `${n.etiqueta.slice(0, 21)}…` : n.etiqueta}
                  </text>
                  <text x="14" y="35" className="ez-nodo-t-valor">
                    {n.valor}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {/* Acceso por teclado y lector de pantalla: fuentes y contenidos como botones. */}
      <div className="ez-traza-botones">
        <span>{tr("ez_dc_col_fuentes")}:</span>
        {datos.fuentes.map((f) => (
          <button
            key={f.clave}
            aria-pressed={seleccion?.tipo === "fuente" && seleccion.clave === f.clave}
            onClick={() => setSeleccion({ tipo: "fuente", clave: f.clave })}
          >
            {f.etiqueta} ({f.eventos})
          </button>
        ))}
      </div>
      {datos.contenidos.length > 0 && (
        <div className="ez-traza-botones">
          <span>{tr("ez_dc_col_contenidos")}:</span>
          {datos.contenidos.slice(0, 30).map((c) => (
            <button
              key={c.id}
              aria-pressed={seleccion?.tipo === "contenido" && seleccion.id === c.id}
              onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}
            >
              {c.titulo.length > 40 ? `${c.titulo.slice(0, 39)}…` : c.titulo}
            </button>
          ))}
        </div>
      )}
      <p className="ep-nota">{tr("ez_dc_trazaAyuda")}</p>
    </div>
  );
}

/* ── Panel de detalle compartido ── */
function FilaEvento({ e, tr, onClick }: { e: Evento; tr: Tr; onClick: () => void }) {
  return (
    <li>
      <button className="ez-dc-fila" onClick={onClick}>
        <strong>{e.titulo}</strong>
        <small>
          {[
            e.fecha ?? tr("ez_dc_sinFecha"),
            e.departamento ?? tr("ez_mapa_sinUbicacion"),
            tr(`ez_evest_${e.estado}`),
            `${e.registros.length} ${tr("ez_dc_fuentesN")}`,
            `${e.contenidos.length} ${tr("ez_dc_contenidosN")}`,
          ].join(" · ")}
        </small>
      </button>
    </li>
  );
}
function DestinoLinea({
  d,
  tr,
}: {
  d: {
    canal: string;
    estado: string;
    enlace: string | null;
    fecha: string | null;
    realizado: boolean;
  };
  tr: Tr;
}) {
  return (
    <li className={d.estado === "envio_sin_confirmar" ? "ez-det-error" : ""}>
      {nombresCanal[d.canal] ?? d.canal} · {tr(`ez_dest_${d.estado}`)}
      {d.enlace && (
        <a href={d.enlace} target="_blank" rel="noreferrer noopener">
          {" "}
          {tr("ez_dc_verPublicacion")} <ArrowUpRight size={11} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}
function PanelDetalle({
  datos,
  seleccion,
  setSeleccion,
  tr,
  fecha,
}: {
  datos: Datos;
  seleccion: Seleccion;
  setSeleccion: (s: Seleccion) => void;
  tr: Tr;
  fecha: (iso: string) => string;
}) {
  if (!seleccion)
    return (
      <aside className="ez-dc-panel ez-dc-panel-vacio">
        <p>{tr("ez_dc_elige")}</p>
      </aside>
    );
  const cerrar = (
    <button className="ez-cerrar" onClick={() => setSeleccion(null)} aria-label={tr("p_cerrar")}>
      <X size={16} />
    </button>
  );
  const abrirEvento = (id: string) => setSeleccion({ tipo: "evento", id });
  if (seleccion.tipo === "departamento") {
    const lista = datos.eventos.filter((e) =>
      seleccion.nombre === "sin_ubicacion" ? !e.departamento : e.departamento === seleccion.nombre,
    );
    const contenidos = new Set(lista.flatMap((e) => e.contenidos));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>
            {seleccion.nombre === "sin_ubicacion" ? tr("ez_mapa_sinUbicacion") : seleccion.nombre}
          </h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {lista.length} {tr("ez_dc_m_eventos").toLowerCase()} · {contenidos.size}{" "}
          {tr("ez_dc_m_contenidos").toLowerCase()}
          {seleccion.nombre !== "sin_ubicacion" && ` · ${tr("ez_dc_agregadoNota")}`}
        </p>
        <ul className="ez-dc-lista">
          {lista.map((e) => (
            <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
          ))}
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "evento") {
    const e = datos.eventos.find((x) => x.id === seleccion.id);
    if (!e) return <aside className="ez-dc-panel">{cerrar}</aside>;
    const contenidos = datos.contenidos.filter((c) => e.contenidos.includes(c.id));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{e.titulo}</h3>
          {cerrar}
        </header>
        <dl className="ez-det-datos">
          <div>
            <dt>{tr("ez_dc_ubicacion")}</dt>
            <dd>
              {e.departamento
                ? [e.lugar, e.municipio, e.departamento].filter(Boolean).join(", ")
                : tr("ez_mapa_sinUbicacion")}
            </dd>
          </div>
          <div>
            <dt>{tr("ez_dc_fechas")}</dt>
            <dd>
              {tr("ez_dc_fecha_evento")}: {e.fecha ?? tr("ez_dc_sinFecha")} ·{" "}
              {tr("ez_dc_fecha_descubrimiento")}: {fecha(e.descubierto)}
            </dd>
          </div>
          <div>
            <dt>{tr("ez_dc_f_estado")}</dt>
            <dd>{tr(`ez_evest_${e.estado}`)}</dd>
          </div>
        </dl>
        <h4>
          {tr("ez_dc_procedencia")} ({e.registros.length})
        </h4>
        {e.registros.length ? (
          <ul className="ez-det-lista">
            {e.registros.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  {r.etiqueta} <ArrowUpRight size={11} aria-hidden="true" />
                </a>
                <small>
                  {r.via === "web" ? tr("ez_dc_web") : r.via}
                  {r.leido ? ` · ${tr("ez_dc_leido")} ${fecha(r.leido)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_det_procedenciaNoRegistrada")}</p>
        )}
        <h4>{tr("ez_dc_agentes")}</h4>
        {e.ejecucion ? (
          <ul className="ez-det-lista">
            {e.ejecucion.pasos.map((p, i) => (
              <li
                key={`${p.agente}-${i}`}
                className={p.estado === "fallido" || p.estado === "bloqueado" ? "ez-det-error" : ""}
              >
                {p.titulo}
                <small>{e.ejecucion!.granja ?? ""}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_dc_sinEjecucion")}</p>
        )}
        <h4>
          {tr("ez_dc_contenidoAsociado")} ({contenidos.length})
        </h4>
        {contenidos.length ? (
          <ul className="ez-det-lista">
            {contenidos.map((c) => (
              <li key={c.id}>
                <button
                  className="ez-dc-enlace"
                  onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}
                >
                  {c.titulo}
                </button>
                <small>
                  {c.destinos
                    .map((d) => `${nombresCanal[d.canal] ?? d.canal}: ${tr(`ez_dest_${d.estado}`)}`)
                    .join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_dc_sinContenido")}</p>
        )}
        <h4>Spotmi web</h4>
        <ul className="ez-det-lista">
          <DestinoLinea d={e.spotmi} tr={tr} />
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "fuente") {
    const f = datos.fuentes.find((x) => x.clave === seleccion.clave);
    const lista = datos.eventos.filter((e) => e.registros.some((r) => r.clave === seleccion.clave));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{f?.etiqueta ?? seleccion.clave}</h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {f
            ? `${f.eventos} ${tr("ez_dc_m_eventos").toLowerCase()} · ${f.relaciones} ${tr("ez_dc_t_relaciones").toLowerCase()}${f.ultimaLectura ? ` · ${tr("ez_dc_leido")} ${fecha(f.ultimaLectura)}` : ""}`
            : ""}
        </p>
        <ul className="ez-dc-lista">
          {lista.map((e) => (
            <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
          ))}
        </ul>
      </aside>
    );
  }
  if (seleccion.tipo === "contenido") {
    const c = datos.contenidos.find((x) => x.id === seleccion.id);
    if (!c) return <aside className="ez-dc-panel">{cerrar}</aside>;
    const evs = datos.eventos.filter((e) => c.eventos.includes(e.id));
    return (
      <aside className="ez-dc-panel">
        <header>
          <h3>{c.titulo}</h3>
          {cerrar}
        </header>
        <p className="ep-nota">
          {tr(`ez_dc_contenido_${c.tipo}`)} · v{c.versiones}
        </p>
        <h4>{tr("ez_det_destinos")}</h4>
        <ul className="ez-det-lista">
          {c.destinos.map((d) => (
            <DestinoLinea key={d.canal} d={d} tr={tr} />
          ))}
        </ul>
        <h4>
          {tr("ez_dc_sustento")} ({evs.length})
        </h4>
        {evs.length ? (
          <ul className="ez-dc-lista">
            {evs.map((e) => (
              <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
            ))}
          </ul>
        ) : (
          <p className="ez-vacio">{tr("ez_det_procedenciaNoRegistrada")}</p>
        )}
      </aside>
    );
  }
  // Conexión o grupo: los registros que la componen.
  const [desde, hasta] = [seleccion.desde, seleccion.hasta];
  const eventosDe = (id: string) =>
    id.startsWith("e:")
      ? datos.eventos.filter((e) => e.estado === id.slice(2))
      : id.startsWith("f:")
        ? datos.eventos.filter((e) => e.registros.some((r) => r.clave === id.slice(2)))
        : null;
  const contenidosDe = (id: string) =>
    id.startsWith("c:")
      ? datos.contenidos.filter((c) => c.tipo === id.slice(2))
      : id.startsWith("d:")
        ? datos.contenidos.filter((c) =>
            c.destinos.some((d) => d.canal === id.slice(2) && d.estado !== "no_enviado"),
          )
        : null;
  let evs =
    desde === "d:spotmi"
      ? datos.eventos.filter((e) => e.spotmi.estado !== "no_enviado")
      : (eventosDe(desde) ?? datos.eventos);
  const otros = eventosDe(hasta);
  if (otros && desde !== hasta) evs = evs.filter((e) => otros.includes(e));
  let cons = contenidosDe(hasta) ?? (desde.startsWith("c:") ? contenidosDe(desde) : null);
  if (cons && desde.startsWith("e:"))
    cons = cons.filter((c) => c.eventos.some((id) => evs.some((e) => e.id === id)));
  const soloContenidos = desde.startsWith("c:") || (desde.startsWith("d:") && desde !== "d:spotmi");
  const etiqueta = (id: string) => {
    if (id.startsWith("f:"))
      return datos.fuentes.find((f) => f.clave === id.slice(2))?.etiqueta ?? id.slice(2);
    if (id.startsWith("e:")) return tr(`ez_dc_eventos_${id.slice(2)}`);
    if (id.startsWith("c:")) return tr(`ez_dc_contenido_${id.slice(2)}`);
    return nombresCanal[id.slice(2)] ?? id.slice(2);
  };
  return (
    <aside className="ez-dc-panel">
      <header>
        <h3>{desde === hasta ? etiqueta(desde) : `${etiqueta(desde)} → ${etiqueta(hasta)}`}</h3>
        {cerrar}
      </header>
      {!soloContenidos && (
        <>
          <h4>
            {tr("ez_dc_m_eventos")} ({evs.length})
          </h4>
          <ul className="ez-dc-lista">
            {evs.slice(0, 80).map((e) => (
              <FilaEvento key={e.id} e={e} tr={tr} onClick={() => abrirEvento(e.id)} />
            ))}
          </ul>
        </>
      )}
      {cons && (
        <>
          <h4>
            {tr("ez_dc_m_contenidos")} ({cons.length})
          </h4>
          <ul className="ez-det-lista">
            {cons.map((c) => (
              <li key={c.id}>
                <button
                  className="ez-dc-enlace"
                  onClick={() => setSeleccion({ tipo: "contenido", id: c.id })}
                >
                  {c.titulo}
                </button>
                <small>
                  {c.destinos
                    .map((d) => `${nombresCanal[d.canal] ?? d.canal}: ${tr(`ez_dest_${d.estado}`)}`)
                    .join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
