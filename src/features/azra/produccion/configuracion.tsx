"use client";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  ArrowUpRight,
  Cable,
  Gauge,
  HardDrive,
  LayoutGrid,
  LogOut,
  Moon,
  Palette,
  Search,
  Settings,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
import type { ResumenUsoIA } from "@/lib/ia/uso";
import type { Equipo } from "@/lib/equipo/modelo";
import { useLanguage } from "../i18n";
import { SeccionConsumo } from "../granjas/consumo";
import { guardarSidebarContraida, guardarTema, useSidebarContraida, useTema } from "../shell";
import { GruposUso, useUsoIA } from "./uso-ia-ui";
import "./configuracion.css";

type Tr = (clave: string) => string;
export const ajustes = ["cuenta", "uso", "general", "apariencia", "almacenamiento"] as const;
export type Ajuste = (typeof ajustes)[number];
/** Destinos fuera de Configuración: se abren en su propia sección (flecha ↗, como «Facturación» en ChatGPT). */
type Externo = "equipo" | "conexiones" | "apps";

/* ── Página de Configuración ── */
type ItemAjuste = {
  id: Ajuste | Externo;
  etiqueta: string;
  icono: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  externo?: boolean;
};
export function Configuracion({
  tr,
  g,
  fecha,
  equipo,
  puede,
  onIr,
}: {
  tr: Tr;
  g: (clave: string) => string;
  fecha: (iso: string) => string;
  equipo: Equipo | null;
  /** ¿Puede esta sesión abrir la sección del estudio? (el servidor lo vuelve a comprobar). */
  puede: (seccion: string) => boolean;
  onIr: (seccion: Externo) => void;
}) {
  const { locale } = useLanguage();
  const esPropietario = equipo?.rol === "propietario";
  const { user } = useUser();
  const nombre = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  // Solo lo que funciona en Ezra. Equipo, Conexiones y Apps se abren en su propia sección (↗).
  const si = (condicion: boolean, item: ItemAjuste): ItemAjuste[] => (condicion ? [item] : []);
  const todos: { titulo: string; items: ItemAjuste[] }[] = [
    {
      titulo: tr("cf_grupoCuenta"),
      items: [
        { id: "cuenta", etiqueta: tr("cf_cuenta"), icono: UserRound },
        ...si(puede("consumo"), { id: "uso", etiqueta: tr("cf_uso"), icono: Gauge }),
        ...si(esPropietario, {
          id: "equipo",
          etiqueta: tr("eq_titulo"),
          icono: Users,
          externo: true,
        }),
      ],
    },
    {
      titulo: tr("cf_grupoApp"),
      items: [
        { id: "general", etiqueta: tr("cf_general"), icono: Settings },
        { id: "apariencia", etiqueta: tr("cf_apariencia"), icono: Palette },
      ],
    },
    {
      titulo: tr("cf_grupoDatos"),
      items: si(esPropietario, {
        id: "almacenamiento",
        etiqueta: tr("cf_almacenamiento"),
        icono: HardDrive,
      }),
    },
    {
      titulo: tr("cf_grupoIntegraciones"),
      items: [
        ...si(puede("conexiones"), {
          id: "conexiones",
          etiqueta: tr("p_conexiones"),
          icono: Cable,
          externo: true,
        }),
        ...si(puede("apps"), {
          id: "apps",
          etiqueta: tr("ez_apps"),
          icono: LayoutGrid,
          externo: true,
        }),
      ],
    },
  ];
  const grupos = todos.filter((grupo) => grupo.items.length > 0);
  const disponibles = grupos
    .flatMap((x) => x.items)
    .filter((i) => !i.externo)
    .map((i) => i.id as Ajuste);
  const leerPedido = (): Ajuste => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("ajuste") ?? (q.get("seccion") === "consumo" ? "uso" : null);
    return p && (disponibles as string[]).includes(p) ? (p as Ajuste) : "cuenta";
  };
  const [actual, setActual] = useState<Ajuste>("cuenta");
  useEffect(() => {
    const leer = () => setActual(leerPedido());
    queueMicrotask(leer);
    window.addEventListener("popstate", leer);
    window.addEventListener("ezra:ajuste", leer);
    return () => {
      window.removeEventListener("popstate", leer);
      window.removeEventListener("ezra:ajuste", leer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busqueda, setBusqueda] = useState("");
  const filtro = busqueda.trim().toLocaleLowerCase();
  function elegir(item: ItemAjuste) {
    if (item.externo) return onIr(item.id as Externo);
    const url = `${window.location.pathname}?seccion=ajustes&ajuste=${item.id}`;
    if (`${window.location.pathname}${window.location.search}` !== url)
      window.history.pushState({ seccion: "ajustes" }, "", url);
    setActual(item.id as Ajuste);
  }
  return (
    <div className="cf-marco">
      <nav className="cf-menu" aria-label={tr("cf_titulo")}>
        <label className="cf-buscar">
          <Search size={16} aria-hidden="true" />
          <span className="ep-oculto-visual">{tr("cf_buscar")}</span>
          <input
            type="search"
            value={busqueda}
            placeholder={tr("cf_buscar")}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        {nombre && !filtro && (
          <div className="cf-grupo">
            <p className="cf-grupo-titulo">{tr("cf_perfil")}</p>
            <button className="cf-item" onClick={() => elegir(grupos[0].items[0])}>
              <span className="cf-avatar" aria-hidden="true">
                {iniciales(nombre)}
              </span>
              <span>{nombre}</span>
            </button>
          </div>
        )}
        {grupos.map((grupo) => {
          const items = grupo.items.filter(
            (i) => !filtro || i.etiqueta.toLocaleLowerCase().includes(filtro),
          );
          if (!items.length) return null;
          return (
            <div key={grupo.titulo} className="cf-grupo">
              <p className="cf-grupo-titulo">{grupo.titulo}</p>
              {items.map((item) => (
                <button
                  key={item.id}
                  className="cf-item"
                  aria-current={!item.externo && actual === item.id ? "page" : undefined}
                  onClick={() => elegir(item)}
                >
                  <item.icono size={17} aria-hidden />
                  <span>{item.etiqueta}</span>
                  {item.externo && (
                    <ArrowUpRight size={15} aria-hidden className="cf-item-externo" />
                  )}
                </button>
              ))}
            </div>
          );
        })}
        {filtro &&
          !grupos.some((x) =>
            x.items.some((i) => i.etiqueta.toLocaleLowerCase().includes(filtro)),
          ) && <p className="cf-nota">{tr("cf_sinResultados")}</p>}
      </nav>
      <section className="cf-contenido" aria-live="polite">
        {actual === "cuenta" && <PaginaCuenta tr={tr} equipo={equipo} />}
        {actual === "uso" && puede("consumo") && (
          <PaginaUso tr={tr} g={g} fecha={fecha} locale={locale} esPropietario={esPropietario} />
        )}
        {actual === "general" && <PaginaGeneral tr={tr} />}
        {actual === "apariencia" && <PaginaApariencia tr={tr} />}
        {actual === "almacenamiento" && esPropietario && (
          <PaginaAlmacenamiento tr={tr} locale={locale} />
        )}
      </section>
    </div>
  );
}
const iniciales = (nombre: string) =>
  nombre
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");

function Encabezado({ titulo, ayuda }: { titulo: string; ayuda?: string }) {
  return (
    <header className="cf-encabezado">
      <h2>{titulo}</h2>
      {ayuda && <p>{ayuda}</p>}
    </header>
  );
}
function Renglon({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children?: ReactNode;
}) {
  return (
    <div className="cf-renglon">
      <div>
        <strong>{titulo}</strong>
        {ayuda && <p>{ayuda}</p>}
      </div>
      {children && <div className="cf-renglon-control">{children}</div>}
    </div>
  );
}

function PaginaCuenta({ tr, equipo }: { tr: Tr; equipo: Equipo | null }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [saliendo, setSaliendo] = useState(false);
  const correo = user?.primaryEmailAddress?.emailAddress ?? "";
  const nombre = user?.fullName || correo;
  return (
    <>
      <Encabezado titulo={tr("cf_cuenta")} ayuda={tr("cf_cuentaAyuda")} />
      <div className="cf-tarjeta cf-perfil">
        <span className="cf-avatar cf-avatar-grande" aria-hidden="true">
          {iniciales(nombre || "?")}
        </span>
        <div>
          <strong>{nombre || "—"}</strong>
          <p>{correo}</p>
        </div>
      </div>
      <div className="cf-tarjeta">
        <Renglon titulo={tr("cf_rol")} ayuda={tr("cf_rolAyuda")}>
          <span className="cf-chip">{equipo ? tr(`cf_rol_${equipo.rol}`) : "—"}</span>
        </Renglon>
        <Renglon
          titulo={tr("cf_acceso")}
          ayuda={equipo?.secciones.map((s) => tr(`cf_sec_${s}`)).join(" · ") || "—"}
        >
          <span className="cf-chip">
            {equipo?.soloLectura ? tr("cf_soloLectura") : tr("cf_lecturaEscritura")}
          </span>
        </Renglon>
        <Renglon titulo={tr("cf_sesion")} ayuda={tr("cf_sesionAyuda")}>
          <button
            className="ez-boton-blanco"
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true);
              void signOut({ redirectUrl: "/sign-in" }).catch(() => setSaliendo(false));
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            {tr("signOut")}
          </button>
        </Renglon>
      </div>
    </>
  );
}

function PaginaUso({
  tr,
  g,
  fecha,
  locale,
  esPropietario,
}: {
  tr: Tr;
  g: (c: string) => string;
  fecha: (iso: string) => string;
  locale: string;
  esPropietario: boolean;
}) {
  const [pestana, setPestana] = useState<"resumen" | "analitica">("resumen");
  const { uso, error, recargar } = useUsoIA(pestana === "resumen");
  const estadoGemini = uso
    ? uso.gemini.habilitado
      ? "cf_activa"
      : uso.gemini.configurado
        ? "cf_claveSinActivar"
        : "cf_sinClave"
    : null;
  const estadoLocal = (e: ResumenUsoIA["astra"]["estado"]) =>
    e === "prueba_ok" || e === "sesion_ok"
      ? "cf_sesionLista"
      : e === "limite"
        ? "cf_limiteProveedor"
        : e
          ? "cf_sesionPendiente"
          : "cf_sinComprobar";
  return (
    <>
      <Encabezado titulo={tr("cf_uso")} ayuda={tr("cf_usoAyuda")} />
      <div className="cf-pestanas" role="tablist" aria-label={tr("cf_uso")}>
        {(["resumen", "analitica"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}>
            {tr(`cf_${p}`)}
          </button>
        ))}
      </div>
      {pestana === "analitica" ? (
        <div className="cf-analitica">
          <SeccionConsumo g={g} fecha={fecha} locale={locale} />
        </div>
      ) : (
        <>
          <h3 className="cf-subtitulo">{tr("cf_tusIA")}</h3>
          <p className="cf-nota">{tr("cf_tusIAAyuda")}</p>
          {error && (
            <p className="cf-nota" role="alert">
              {tr("cf_errorUso")}{" "}
              <button className="cf-enlace" onClick={() => void recargar()}>
                {tr("cf_reintentar")}
              </button>
            </p>
          )}
          {!uso && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
          {uso && (
            <>
              <div className="cf-tarjeta cf-ias">
                <Renglon titulo={`Gemini · ${uso.gemini.modelo}`} ayuda={tr("cf_geminiAyuda")}>
                  <span className="cf-chip">{tr(estadoGemini!)}</span>
                </Renglon>
                <Renglon
                  titulo={tr("cf_astra")}
                  ayuda={`${uso.astra.usados} ${tr("cf_intentosEsteMes")}`}
                >
                  <span className="cf-chip">{tr(estadoLocal(uso.astra.estado))}</span>
                </Renglon>
                <Renglon
                  titulo={tr("cf_claude")}
                  ayuda={`${uso.claude.usados} ${tr("cf_intentosEsteMes")}`}
                >
                  <span className="cf-chip">{tr(estadoLocal(uso.claude.estado))}</span>
                </Renglon>
              </div>
              <h3 className="cf-subtitulo">{tr("cf_limites")}</h3>
              <p className="cf-nota">
                {tr("cf_limitesAyuda")}{" "}
                {esPropietario && (
                  <button className="cf-enlace" onClick={() => setPestana("analitica")}>
                    {tr("cf_cambiarLimites")}
                  </button>
                )}
              </p>
              <div className="cf-tarjeta cf-limites">
                <GruposUso uso={uso} tr={tr} locale={locale} />
              </div>
              {!uso.chatgpt && <p className="cf-nota">{tr("cf_sinCodex")}</p>}
            </>
          )}
        </>
      )}
    </>
  );
}

function PaginaGeneral({ tr }: { tr: Tr }) {
  const { locale, setLocale } = useLanguage();
  return (
    <>
      <Encabezado titulo={tr("cf_general")} />
      <div className="cf-tarjeta">
        <Renglon titulo={tr("language")} ayuda={tr("cf_idiomaAyuda")}>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as "es" | "en")}
            aria-label={tr("language")}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </Renglon>
        <Renglon titulo={tr("cf_zona")} ayuda={tr("cf_zonaAyuda")}>
          <span className="cf-chip">America/El_Salvador</span>
        </Renglon>
      </div>
    </>
  );
}

function PaginaApariencia({ tr }: { tr: Tr }) {
  const tema = useTema();
  const oculta = useSidebarContraida();
  return (
    <>
      <Encabezado titulo={tr("cf_apariencia")} />
      <div className="cf-tarjeta">
        <Renglon titulo={tr("cf_tema")} ayuda={tr("cf_temaAyuda")}>
          <div className="cf-segmentos" role="group" aria-label={tr("cf_tema")}>
            {(
              [
                ["claro", Sun, "cf_claro"],
                ["oscuro", Moon, "cf_oscuro"],
              ] as const
            ).map(([id, Icono, clave]) => (
              <button key={id} aria-pressed={tema === id} onClick={() => guardarTema(id)}>
                <Icono size={15} aria-hidden="true" />
                {tr(clave)}
              </button>
            ))}
          </div>
        </Renglon>
        <Renglon titulo={tr("cf_barra")} ayuda={tr("cf_barraAyuda")}>
          <button
            role="switch"
            aria-checked={!oculta}
            aria-label={tr("cf_barra")}
            className="cf-interruptor"
            onClick={() => guardarSidebarContraida(!oculta)}
          >
            <span />
          </button>
        </Renglon>
      </div>
    </>
  );
}

type Almacen = {
  bytes: { base: number; medios: number };
  conteos: Record<
    "granjas" | "ejecuciones" | "artefactos" | "medios" | "piezas" | "recibos",
    number
  >;
  trabajador: string;
};
function PaginaAlmacenamiento({ tr, locale }: { tr: Tr; locale: string }) {
  const [datos, setDatos] = useState<Almacen | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch("/api/granjas/almacenamiento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);
  const tam = useMemo(() => {
    const f = new Intl.NumberFormat(locale === "es" ? "es-SV" : "en-US", {
      maximumFractionDigits: 1,
    });
    return (b: number) =>
      b >= 1e9
        ? `${f.format(b / 1e9)} GB`
        : b >= 1e6
          ? `${f.format(b / 1e6)} MB`
          : `${f.format(b / 1e3)} KB`;
  }, [locale]);
  return (
    <>
      <Encabezado titulo={tr("cf_almacenamiento")} ayuda={tr("cf_almacenamientoAyuda")} />
      {error && (
        <p className="cf-nota" role="alert">
          {tr("cf_errorAlmacen")}
        </p>
      )}
      {!datos && !error && <p className="cf-nota">{tr("cf_cargando")}</p>}
      {datos && (
        <>
          <div className="cf-tarjeta">
            <Renglon titulo={tr("cf_baseDatos")} ayuda={tr("cf_baseDatosAyuda")}>
              <span className="cf-chip">{tam(datos.bytes.base)}</span>
            </Renglon>
            <Renglon
              titulo={tr("cf_medios")}
              ayuda={`${datos.conteos.medios} ${tr("cf_archivos")}`}
            >
              <span className="cf-chip">{tam(datos.bytes.medios)}</span>
            </Renglon>
            <Renglon
              titulo={tr("cf_registros")}
              ayuda={`${datos.conteos.granjas} ${tr("cf_c_granjas")} · ${datos.conteos.ejecuciones} ${tr("cf_c_ejecuciones")} · ${datos.conteos.piezas} ${tr("cf_c_piezas")} · ${datos.conteos.recibos} ${tr("cf_c_recibos")}`}
            />
          </div>
          <div className="cf-tarjeta">
            <Renglon titulo={tr("cf_respaldo")} ayuda={tr("cf_respaldoAyuda")}>
              <a
                className="ez-boton-blanco"
                href="/api/granjas/almacenamiento?descargar=1"
                download
              >
                {tr("cf_descargar")}
              </a>
            </Renglon>
          </div>
        </>
      )}
    </>
  );
}
