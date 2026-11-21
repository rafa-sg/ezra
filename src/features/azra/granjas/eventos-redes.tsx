"use client";
import { useState } from "react";
import { Link2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { CuentasSeguidas, EstadoLectura } from "@/lib/granjas/redes";
import { Modal } from "../ui";
import { pedir } from "./cliente";

const tipos = ["recinto", "productora", "alcaldia", "ticketera", "organizador", "otro"] as const;
type Tipo = (typeof tipos)[number];

/**
 * «Cuentas a seguir»: cuentas profesionales de Instagram (Business Discovery) y Páginas de
 * Facebook (solo con Page Public Content Access). Nada se lee raspando la red.
 */
export function CuentasSeguir({
  g,
  cuentas,
  lectura,
  alGuardar,
}: {
  g: (clave: string) => string;
  cuentas: CuentasSeguidas;
  lectura: { instagram: EstadoLectura; facebook: EstadoLectura };
  alGuardar: () => Promise<void>;
}) {
  const [lista, setLista] = useState(cuentas);
  const [nuevaIg, setNuevaIg] = useState<{ usuario: string; tipo: Tipo }>({
    usuario: "",
    tipo: "recinto",
  });
  const [nuevaFb, setNuevaFb] = useState<{ pagina: string; tipo: Tipo }>({
    pagina: "",
    tipo: "recinto",
  });
  const [estado, setEstado] = useState<{ ocupado: boolean; error: string; aviso: string }>({
    ocupado: false,
    error: "",
    aviso: "",
  });
  const cambiado = JSON.stringify(lista) !== JSON.stringify(cuentas);
  async function guardar() {
    setEstado({ ocupado: true, error: "", aviso: "" });
    try {
      const r = await pedir<{ cuentas: CuentasSeguidas }>("/api/granjas/eventos", {
        accion: "cuentas",
        cuentas: lista,
      });
      setLista(r.cuentas);
      setEstado({ ocupado: false, error: "", aviso: g("ev_redes_guardadas") });
      await alGuardar();
    } catch (e) {
      setEstado({ ocupado: false, error: (e as Error).message, aviso: "" });
    }
  }
  async function leerAhora() {
    setEstado({ ocupado: true, error: "", aviso: "" });
    try {
      const r = await pedir<{
        redes: {
          cuentas: number;
          posts: number;
          candidatos: number;
          errores: string[];
          omitido: string;
        };
        verificacion: {
          nuevos: number;
          duplicados: number;
          descartados: number;
          conImagen: number;
        } | null;
      }>("/api/granjas/eventos", { accion: "leer_redes" });
      const v = r.verificacion;
      setEstado({
        ocupado: false,
        error: [r.redes.omitido, ...r.redes.errores].filter(Boolean).join(" · "),
        aviso: `${r.redes.cuentas} ${g("ev_redes_cuentasLeidas")} · ${r.redes.posts} posts · ${v?.nuevos ?? 0} ${g("ev_imp_nuevos")} · ${v?.duplicados ?? 0} ${g("ev_imp_duplicados")} · ${v?.conImagen ?? 0} ${g("ev_imp_conImagen")}`,
      });
      await alGuardar();
    } catch (e) {
      setEstado({ ocupado: false, error: (e as Error).message, aviso: "" });
    }
  }
  const puedeLeer =
    (lectura.instagram.listo && cuentas.instagram.length > 0) ||
    (lectura.facebook.listo && cuentas.facebook.length > 0);
  const selector = (valor: Tipo, cambiar: (t: Tipo) => void, etiqueta: string) => (
    <select aria-label={etiqueta} value={valor} onChange={(e) => cambiar(e.target.value as Tipo)}>
      {tipos.map((t) => (
        <option key={t} value={t}>
          {g(`ev_redes_tipo_${t}`)}
        </option>
      ))}
    </select>
  );
  return (
    <details className="eg-bloque eg-plegable">
      <summary>
        <strong>{g("ev_redes_titulo")}</strong> · {cuentas.instagram.length} Instagram ·{" "}
        {cuentas.facebook.length} Facebook
      </summary>
      <p className="ep-nota">{g("ev_redes_ayuda")}</p>
      {estado.error && (
        <p className="ep-alerta" role="alert">
          {estado.error}
        </p>
      )}
      {estado.aviso && (
        <p className="ep-aviso" role="status">
          {estado.aviso}
        </p>
      )}
      <div className="eg-redes">
        <section>
          <h3>Instagram</h3>
          <p className={lectura.instagram.listo ? "ep-nota" : "eg-presupuesto-aviso"}>
            {lectura.instagram.listo ? g("ev_redes_igListo") : lectura.instagram.motivo}
          </p>
          <ul className="eg-cuentas">
            {lista.instagram.map((c, i) => (
              <li key={c.usuario}>
                <span>@{c.usuario}</span>
                {selector(
                  c.tipo,
                  (t) =>
                    setLista({
                      ...lista,
                      instagram: lista.instagram.map((x, j) => (j === i ? { ...x, tipo: t } : x)),
                    }),
                  `${g("ev_redes_tipo")} @${c.usuario}`,
                )}
                <button
                  className="ep-boton ep-texto"
                  aria-label={`${g("ev_redes_quitar")} @${c.usuario}`}
                  onClick={() =>
                    setLista({ ...lista, instagram: lista.instagram.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="eg-formulario-linea"
            onSubmit={(e) => {
              e.preventDefault();
              const usuario = nuevaIg.usuario.trim().replace(/^@/, "").toLowerCase();
              if (!usuario || lista.instagram.some((c) => c.usuario === usuario)) return;
              setLista({
                ...lista,
                instagram: [...lista.instagram, { usuario, tipo: nuevaIg.tipo, nota: "" }],
              });
              setNuevaIg({ usuario: "", tipo: nuevaIg.tipo });
            }}
          >
            <label className="eg-campo">
              {g("ev_redes_usuario")}
              <input
                value={nuevaIg.usuario}
                maxLength={31}
                pattern="@?[A-Za-z0-9._]{1,30}"
                placeholder="@recinto"
                onChange={(e) => setNuevaIg({ ...nuevaIg, usuario: e.target.value })}
              />
            </label>
            {selector(nuevaIg.tipo, (t) => setNuevaIg({ ...nuevaIg, tipo: t }), g("ev_redes_tipo"))}
            <button className="ep-boton" disabled={!nuevaIg.usuario.trim()}>
              <Plus size={15} />
              {g("ev_redes_agregar")}
            </button>
          </form>
        </section>
        <section>
          <h3>Facebook</h3>
          <p className={lectura.facebook.listo ? "ep-nota" : "eg-presupuesto-aviso"}>
            {lectura.facebook.listo ? g("ev_redes_fbListo") : lectura.facebook.motivo}
          </p>
          <ul className="eg-cuentas">
            {lista.facebook.map((c, i) => (
              <li key={c.pagina}>
                <span>{c.pagina}</span>
                {selector(
                  c.tipo,
                  (t) =>
                    setLista({
                      ...lista,
                      facebook: lista.facebook.map((x, j) => (j === i ? { ...x, tipo: t } : x)),
                    }),
                  `${g("ev_redes_tipo")} ${c.pagina}`,
                )}
                <button
                  className="ep-boton ep-texto"
                  aria-label={`${g("ev_redes_quitar")} ${c.pagina}`}
                  onClick={() =>
                    setLista({ ...lista, facebook: lista.facebook.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="eg-formulario-linea"
            onSubmit={(e) => {
              e.preventDefault();
              const pagina = nuevaFb.pagina
                .trim()
                .replace(/^https:\/\/(www\.)?facebook\.com\//, "")
                .replace(/\/$/, "");
              if (
                !pagina ||
                lista.facebook.some((c) => c.pagina.toLowerCase() === pagina.toLowerCase())
              )
                return;
              setLista({
                ...lista,
                facebook: [...lista.facebook, { pagina, tipo: nuevaFb.tipo, nota: "" }],
              });
              setNuevaFb({ pagina: "", tipo: nuevaFb.tipo });
            }}
          >
            <label className="eg-campo">
              {g("ev_redes_pagina")}
              <input
                value={nuevaFb.pagina}
                maxLength={140}
                placeholder="nombre.de.la.pagina"
                onChange={(e) => setNuevaFb({ ...nuevaFb, pagina: e.target.value })}
              />
            </label>
            {selector(nuevaFb.tipo, (t) => setNuevaFb({ ...nuevaFb, tipo: t }), g("ev_redes_tipo"))}
            <button className="ep-boton" disabled={!nuevaFb.pagina.trim()}>
              <Plus size={15} />
              {g("ev_redes_agregar")}
            </button>
          </form>
        </section>
      </div>
      <div className="ep-acciones">
        <button
          className="ep-boton ep-primario"
          disabled={!cambiado || estado.ocupado}
          onClick={() => void guardar()}
        >
          <Save size={15} />
          {g("guardar")}
        </button>
        <button
          className="ep-boton"
          disabled={cambiado || !puedeLeer || estado.ocupado}
          onClick={() => void leerAhora()}
          title={g("ev_redes_leerAyuda")}
        >
          <RefreshCw size={15} />
          {g("ev_redes_leer")}
        </button>
      </div>
      <p className="ep-nota">{g("ev_redes_tiktok")}</p>
    </details>
  );
}

export type FormularioManual = {
  url: string;
  titulo: string;
  fecha: string;
  fechaFin: string;
  hora: string;
  lugar: string;
  municipio: string;
  departamento: string;
  categoria: string;
  precio: string;
  boletosUrl: string;
  descripcion: string;
};
const vacio: FormularioManual = {
  url: "",
  titulo: "",
  fecha: "",
  fechaFin: "",
  hora: "",
  lugar: "",
  municipio: "",
  departamento: "",
  categoria: "otro",
  precio: "",
  boletosUrl: "",
  descripcion: "",
};

/** «Pegar enlace»: el propietario pega el enlace de un video o post y escribe los datos; Ezra no abre ese enlace. */
export function PegarEnlace({
  g,
  categorias,
  departamentos,
  alTerminar,
}: {
  g: (clave: string) => string;
  categorias: string[];
  departamentos: string[];
  alTerminar: (mensaje: string) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<FormularioManual>(vacio);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campo = (k: keyof FormularioManual) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  async function enviar() {
    setOcupado(true);
    setError("");
    try {
      const r = await pedir<{ duplicado: boolean }>("/api/granjas/eventos", {
        accion: "pegar_enlace",
        datos: {
          ...f,
          fecha: f.fecha || null,
          fechaFin: f.fechaFin || null,
          hora: f.hora || null,
          precio: f.precio.trim() || null,
          boletosUrl: f.boletosUrl.trim() || null,
        },
      });
      setAbierto(false);
      setF(vacio);
      await alTerminar(g(r.duplicado ? "ev_manual_sumado" : "ev_manual_creado"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <button className="ep-boton" onClick={() => setAbierto(true)} title={g("ev_manual_ayuda")}>
        <Link2 size={15} />
        {g("ev_manual_boton")}
      </button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        label={g("ev_manual_boton")}
        className="ep-modal"
        dismissOnBackdrop
      >
        <form
          className="eg-guia eg-form-evento"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <h2>{g("ev_manual_titulo")}</h2>
          <p className="ep-nota">{g("ev_manual_ayuda")}</p>
          {error && (
            <p className="ep-alerta" role="alert">
              {error}
            </p>
          )}
          <label className="eg-campo">
            {g("ev_manual_url")}
            <input
              type="url"
              required
              maxLength={1000}
              placeholder="https://www.tiktok.com/@cuenta/video/…"
              value={f.url}
              onChange={campo("url")}
            />
          </label>
          {(
            [
              ["titulo", "ev_titulo", "text", 160],
              ["fecha", "ev_fecha", "date", 10],
              ["fechaFin", "ev_fechaFin", "date", 10],
              ["hora", "ev_hora", "time", 5],
              ["lugar", "ev_lugar", "text", 200],
              ["municipio", "ev_municipio", "text", 120],
              ["precio", "ev_precio", "text", 120],
              ["boletosUrl", "ev_boletos", "url", 1000],
            ] as const
          ).map(([k, etiqueta, tipo, max]) => (
            <label key={k} className="eg-campo">
              {g(etiqueta)}
              <input
                type={tipo}
                maxLength={max}
                required={k === "titulo"}
                minLength={k === "titulo" ? 3 : undefined}
                value={f[k]}
                placeholder={
                  ["fecha", "hora", "precio"].includes(k) ? g("ev_porConfirmar") : undefined
                }
                onChange={campo(k)}
              />
            </label>
          ))}
          <div className="eg-dos">
            <label className="eg-campo">
              {g("ev_departamento")}
              <select value={f.departamento} onChange={campo("departamento")}>
                <option value="">—</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="eg-campo">
              {g("ev_categoria")}
              <select value={f.categoria} onChange={campo("categoria")}>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {g(`ev_cat_${c}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="eg-campo">
            {g("ev_descripcion")}
            <textarea
              rows={3}
              maxLength={300}
              value={f.descripcion}
              onChange={campo("descripcion")}
            />
          </label>
          <div className="ep-acciones">
            <button
              className="ep-boton ep-primario"
              disabled={ocupado || f.titulo.trim().length < 3 || !f.url.startsWith("https://")}
            >
              {g("guardar")}
            </button>
            <button type="button" className="ep-boton" onClick={() => setAbierto(false)}>
              {g("ev_cancelar")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export type FilaConfianza = {
  dominio: string;
  tipo: string;
  puntos: number;
  propio: boolean;
  eventos: number;
};
const tiposFuente = ["organizador", "ticketera", "gobierno", "prensa", "agregador"] as const;
const puntosTipo: Record<string, number> = {
  organizador: 90,
  ticketera: 90,
  gobierno: 85,
  prensa: 65,
  agregador: 45,
};

/** «Confianza por dominio»: el propietario fija el tipo y los puntos de cada sitio. */
export function ConfianzaDominios({
  g,
  filas,
  alGuardar,
}: {
  g: (clave: string) => string;
  filas: FilaConfianza[];
  alGuardar: () => Promise<void>;
}) {
  const [edicion, setEdicion] = useState<Record<string, { tipo: string; puntos: number } | null>>(
    {},
  );
  const [estado, setEstado] = useState({ ocupado: false, error: "", aviso: "" });
  const valor = (f: FilaConfianza) =>
    f.dominio in edicion
      ? edicion[f.dominio]
      : f.propio
        ? { tipo: f.tipo, puntos: f.puntos }
        : null;
  async function guardar() {
    setEstado({ ocupado: true, error: "", aviso: "" });
    const dominios = Object.fromEntries(
      filas.flatMap((f) => (valor(f) ? [[f.dominio, valor(f)!]] : [])),
    );
    try {
      await pedir("/api/granjas/eventos", { accion: "confianza_dominios", dominios });
      setEdicion({});
      setEstado({ ocupado: false, error: "", aviso: g("ev_conf_guardada") });
      await alGuardar();
    } catch (e) {
      setEstado({ ocupado: false, error: (e as Error).message, aviso: "" });
    }
  }
  return (
    <details className="eg-bloque eg-plegable">
      <summary>
        <strong>{g("ev_conf_titulo")}</strong>
      </summary>
      <p className="ep-nota">{g("ev_conf_ayuda")}</p>
      {estado.error && (
        <p className="ep-alerta" role="alert">
          {estado.error}
        </p>
      )}
      {estado.aviso && (
        <p className="ep-aviso" role="status">
          {estado.aviso}
        </p>
      )}
      <div className="eg-tabla-desplazable">
        <table className="eg-tabla-confianza">
          <thead>
            <tr>
              <th scope="col">{g("ev_conf_dominio")}</th>
              <th scope="col">{g("ev_redes_tipo")}</th>
              <th scope="col">{g("ev_conf_puntos")}</th>
              <th scope="col">{g("ev_conf_eventos")}</th>
              <th scope="col">
                <span className="eg-oculto-visual">{g("ev_conf_restablecer")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const v = valor(f);
              const tipo = v?.tipo ?? f.tipo;
              const puntos = v?.puntos ?? f.puntos;
              return (
                <tr key={f.dominio}>
                  <th scope="row">{f.dominio}</th>
                  <td>
                    <select
                      aria-label={`${g("ev_redes_tipo")} · ${f.dominio}`}
                      value={tipo}
                      onChange={(e) =>
                        setEdicion({
                          ...edicion,
                          [f.dominio]: {
                            tipo: e.target.value,
                            puntos: puntosTipo[e.target.value] ?? puntos,
                          },
                        })
                      }
                    >
                      {tiposFuente.map((t) => (
                        <option key={t} value={t}>
                          {g(`ev_tipo_${t}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`${g("ev_conf_puntos")} · ${f.dominio}`}
                      type="number"
                      min={0}
                      max={100}
                      value={puntos}
                      onChange={(e) =>
                        setEdicion({
                          ...edicion,
                          [f.dominio]: {
                            tipo,
                            puntos: Math.max(
                              0,
                              Math.min(100, Math.round(Number(e.target.value) || 0)),
                            ),
                          },
                        })
                      }
                    />
                  </td>
                  <td>{f.eventos}</td>
                  <td>
                    {v && (
                      <button
                        className="ep-boton ep-texto"
                        onClick={() => setEdicion({ ...edicion, [f.dominio]: null })}
                      >
                        {g("ev_conf_restablecer")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ep-acciones">
        <button
          className="ep-boton ep-primario"
          disabled={!Object.keys(edicion).length || estado.ocupado}
          onClick={() => void guardar()}
        >
          <Save size={15} />
          {g("guardar")}
        </button>
      </div>
    </details>
  );
}
