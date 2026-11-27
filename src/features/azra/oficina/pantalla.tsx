"use client";
import { useEffect, useState } from "react";
import type { Clase } from "./clases";
import { infoClase } from "./clases";
import "./oficina.css";

/** Avanza por los pasos de la animación; con «reducir movimiento» se queda en el primero. */
function usePaso(total: number, ms: number) {
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setPaso((p) => (p + 1) % total), ms);
    return () => window.clearInterval(t);
  }, [total, ms]);
  return paso;
}

function Etapas({ nombres, paso }: { nombres: string[]; paso: number }) {
  return (
    <ol className="pt-etapas" aria-label="Pasos">
      {nombres.map((n, i) => (
        <li key={n} className={i === paso ? "pt-actual" : i < paso ? "pt-hecho" : ""} aria-current={i === paso ? "step" : undefined}>
          {n}
        </li>
      ))}
    </ol>
  );
}

function Carpeta({ color, titulo, detalle }: { color: [string, string]; titulo: string; detalle: string }) {
  return (
    <div className="pt-carpeta-destino">
      <span className="pt-carpeta" aria-hidden="true">
        <span style={{ background: color[0] }} />
        <span style={{ background: color[1] }} />
      </span>
      <strong>{titulo}</strong>
      <span>{detalle}</span>
    </div>
  );
}

function Lateral({ titulo, detalle, registro }: { titulo: string; detalle: string; registro: string[] }) {
  return (
    <aside className="pt-lateral">
      <div className="pt-rotulo">Lo que estoy haciendo</div>
      <div className="pt-titulo">{titulo}</div>
      <p>{detalle}</p>
      {registro.length > 0 && <div className="pt-rotulo">Registro</div>}
      <ul className="pt-registro">
        {registro.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </aside>
  );
}

function Clips() {
  const paso = usePaso(5, 2800);
  const archivos = ["recorrido_01.mp4", "recorrido_02.mp4", "lago_drone.mp4", "calles_colonial.mp4", "atardecer_muelle.mp4"];
  const picos = new Set([8, 9, 10, 23, 24, 25, 26, 38, 39, 51, 52, 53, 64, 65, 66, 67]);
  const tramos = [[10, 15], [29, 35], [49, 54], [66, 72], [83, 89]];
  const T = [
    ["Elijo el video", "Reviso tu biblioteca y abro el que tiene más tomas del recorrido."],
    ["Lo veo completo", "Marco en amarillo los picos de audio y movimiento: ahí suelen estar los mejores momentos."],
    ["Corto los momentos", "Saco tramos de 15 a 25 s alrededor de los picos; cada uno empieza en la imagen más fuerte."],
    ["Edito para redes", "Paso cada clip a vertical 9:16, centro la acción y agrego subtítulos."],
    ["Guardo los clips", "Van a Almacenamiento › Clips. Ahí los apruebas, eliges cuenta y publicas."],
  ];
  const registro = ["abrí recorrido_02.mp4", "16 picos marcados", "5 cortes", "9:16 · subtítulos", "5 clips guardados"].slice(0, paso + 1);
  return (
    <div className="pt-cuerpo pt-oscuro pt-cian">
      <Etapas nombres={["Seleccionar", "Revisar", "Cortar", "Editar", "Guardar"]} paso={paso} />
      <aside className="pt-biblioteca">
        <div className="pt-rotulo">Biblioteca · tus videos</div>
        {archivos.map((a, i) => (
          <div key={a} className={`pt-archivo ${i === 1 ? "pt-sel" : ""}`}>
            <span className="pt-mini" aria-hidden="true" />
            <span>{a}</span>
          </div>
        ))}
      </aside>
      <main className="pt-centro">
        <div className="pt-visor">
          {paso <= 2 && <div className="pt-cuadro pt-169">[video horizontal]</div>}
          {paso === 3 && (
            <div className="pt-cuadro pt-916">
              <span className="pt-sub">Así se ve desde arriba</span>
            </div>
          )}
          {paso === 4 && <Carpeta color={["#8fd3ef", "#aee0f4"]} titulo="Almacenamiento › Clips" detalle="Listos para aprobar" />}
        </div>
        <div className="pt-linea" aria-hidden="true">
          {Array.from({ length: 76 }, (_, i) => {
            const h = 18 + Math.round(Math.abs(Math.sin(i * 1.7) * 30 + Math.sin(i * 0.4) * 14));
            const pico = picos.has(i) && paso >= 1;
            return <span key={i} style={{ height: pico ? Math.min(h + 22, 70) : h, background: pico ? "#f6c453" : "#2f5866" }} />;
          })}
          {paso >= 2 && paso < 4 && tramos.map(([a, b]) => <i key={a} style={{ left: `${a}%`, width: `${b - a}%` }} />)}
          {paso === 1 && <b className="pt-cabezal" />}
        </div>
      </main>
      <Lateral titulo={T[paso][0]} detalle={T[paso][1]} registro={registro} />
    </div>
  );
}

function Eventos() {
  const paso = usePaso(7, 1900);
  const E: [string, string, string, string, boolean, string][] = [
    ["06", "dic", "Concierto de orquesta", "sitio del recinto", true, ""],
    ["28", "nov", "Noche de rock", "ticketera", false, "Ya pasó"],
    ["13", "dic", "Festival navideño", "alcaldía", true, ""],
    ["14", "dic", "Concierto en la playa", "cuenta sin verificar", false, "Fuente no permitida"],
    ["20", "dic", "Coro de fin de año", "sitio del recinto", true, ""],
    ["31", "dic", "Fiesta de fin de año", "ticketera", true, ""],
  ];
  const actual = E[Math.min(paso, 5)];
  return (
    <div className="pt-cuerpo pt-clasico">
      <Etapas nombres={["Buscar", "Verificar uno por uno", "Guardar"]} paso={paso < 6 ? 1 : 2} />
      <main className="pt-navegador">
        <div className="pt-url">Buscando eventos · solo fuentes permitidas · datos de ejemplo</div>
        <ul className="pt-eventos">
          {E.map((e, i) => {
            const hecho = i < paso;
            const ahora = i === paso && paso < 6;
            const estado = ahora ? "Revisando…" : !hecho ? "Pendiente" : e[4] ? "Guardado ✓" : `Descartado · ${e[5]}`;
            return (
              <li key={e[2]} className={ahora ? "pt-ahora" : hecho && !e[4] ? "pt-descartado" : ""}>
                <span className="pt-fecha">
                  <strong>{e[0]}</strong>
                  {e[1]}
                </span>
                <span className="pt-ev">
                  <strong>{e[2]}</strong>
                  <small>fuente: {e[3]}</small>
                </span>
                <span className={`pt-estado ${hecho ? (e[4] ? "pt-ok" : "pt-no") : ""}`}>{estado}</span>
              </li>
            );
          })}
        </ul>
      </main>
      <aside className="pt-lateral pt-lateral-claro">
        {paso < 6 ? (
          <>
            <div className="pt-rotulo">Revisando ahora</div>
            <div className="pt-titulo">{actual[2]}</div>
            <p>Fecha dentro del período: {actual[5] === "Ya pasó" ? "no" : "sí"}.</p>
            <p>Fuente permitida: {actual[5] === "Fuente no permitida" ? "no" : "sí"}.</p>
            <p>Precio: si la fuente no lo dice, se deja vacío. No se inventa.</p>
            <div className={actual[4] ? "pt-decision pt-ok" : "pt-decision pt-no"}>{actual[4] ? "Lo guardo" : "Lo descarto"}</div>
          </>
        ) : (
          <Carpeta color={["#f0cf5a", "#f7df7f"]} titulo="Almacenamiento › Eventos" detalle="4 guardados · 2 descartados" />
        )}
      </aside>
    </div>
  );
}

function Virales() {
  const paso = usePaso(5, 2800);
  const refs = ["Tráiler: todo lo que viste", "¿Cuándo sale? Fecha", "El lugar en 60 segundos", "5 detalles escondidos", "Reacción al tráiler", "Precio y ediciones"];
  const T = [
    ["Busco lo que funciona", "Pido a YouTube los videos del tema con más vistas por día. Guardo solo enlace y métricas."],
    ["Veo una referencia", "Marco dónde la gente se queda mirando: gancho, pico, giro y cierre."],
    ["Anoto por qué funcionó", "Cada hallazgo lleva su evidencia; no adivino."],
    ["Comparo todas", "Me quedo con lo que se repite en la mayoría, no con lo de un solo video."],
    ["Escribo tu receta", "Informe y receta van a Almacenamiento › Videos virales."],
  ];
  const marcas: [string, number, number, string][] = [["Gancho", 0, 5, "#f9d3dd"], ["Pico", 17, 27, "#fbeea0"], ["Giro", 48, 58, "#cbe6f5"], ["Cierre", 88, 100, "#d3ecd9"]];
  return (
    <div className="pt-cuerpo pt-oscuro pt-morado">
      <Etapas nombres={["Buscar", "Ver", "Anotar", "Comparar", "Receta"]} paso={paso} />
      <aside className="pt-biblioteca">
        <div className="pt-rotulo">Referencias · solo enlaces y métricas</div>
        {refs.slice(0, paso === 0 ? 3 : 6).map((r, i) => (
          <div key={r} className={`pt-archivo ${i === 1 && paso >= 1 ? "pt-sel" : ""}`}>
            <span className="pt-mini" aria-hidden="true" />
            <span>{r}</span>
          </div>
        ))}
      </aside>
      <main className="pt-centro">
        <div className="pt-visor">
          {paso <= 2 && <div className="pt-cuadro pt-169">[referencia · se ve desde YouTube, no se descarga]</div>}
          {paso === 3 && (
            <ul className="pt-patrones">
              {[["Gancho en 2 s", 5], ["Cortes de unos 2 s", 4], ["Pregunta en el título", 4], ["Dura 45 a 70 s", 5]].map(([q, n]) => (
                <li key={q}>
                  <span>{q}</span>
                  <span className="pt-barra">
                    <span style={{ width: `${Math.round((Number(n) / 6) * 100)}%` }} />
                  </span>
                  <span>{n} de 6</span>
                </li>
              ))}
            </ul>
          )}
          {paso === 4 && <Carpeta color={["#b9a8f6", "#cfc3fa"]} titulo="Almacenamiento › Videos virales" detalle="Informe + receta" />}
        </div>
        <div className="pt-atencion" aria-hidden="true">
          {paso >= 1 && marcas.map(([n, a, b, c]) => <i key={n} style={{ left: `${a}%`, width: `${b - a}%`, background: c }}>{n}</i>)}
          {paso <= 2 && <b className="pt-cabezal" />}
        </div>
      </main>
      <Lateral titulo={T[paso][0]} detalle={T[paso][1]} registro={paso >= 2 ? ["Gancho en 2 segundos", "Cortes rápidos", ...(paso >= 3 ? ["Título con pregunta"] : [])] : []} />
    </div>
  );
}

function Post({ nombre }: { nombre: string }) {
  const paso = usePaso(5, 2800);
  const T = [
    ["Elijo la foto", "Busco en tu biblioteca una foto tuya o con permiso, con buena luz."],
    ["Recorto a 4:5", "Instagram muestra mejor 1080×1350: dejo lo importante al centro."],
    ["Pongo el título", "Título corto y grande, con buen contraste. Escribo el texto del post."],
    ["Agrego tu marca", "Logo y @spotmi.sv abajo, con tus colores."],
    ["Guardo el post", `Imagen y texto van a Almacenamiento › ${nombre}.`],
  ];
  return (
    <div className="pt-cuerpo pt-creativo">
      <Etapas nombres={["Elegir foto", "Recortar", "Texto", "Marca", "Guardar"]} paso={paso} />
      <aside className="pt-biblioteca pt-biblioteca-clara">
        <div className="pt-rotulo">Tu biblioteca de fotos</div>
        <div className="pt-fotos">
          {["#e7a0b8,#5d8a5a", "#8fb9d9,#33536e", "#e3c27a,#8a5a2b", "#9ccfa8,#2f6b4f", "#c9a8e8,#4f3a7a", "#f0b38a,#8a3b2b"].map((g, i) => (
            <span key={g} className={i === 0 ? "pt-sel" : ""} style={{ background: `linear-gradient(160deg,${g})` }} />
          ))}
        </div>
      </aside>
      <main className="pt-centro pt-mesa-diseno">
        {paso < 4 ? (
          <div className={`pt-lienzo ${paso >= 1 ? "pt-recortado" : ""}`}>
            <span className="pt-foto" />
            {paso >= 2 && (
              <span className="pt-titular">
                <small>FIN DE SEMANA EN</small>Tu destino
              </span>
            )}
            {paso >= 3 && <span className="pt-firma">@spotmi.sv</span>}
          </div>
        ) : (
          <Carpeta color={["#f2a3b8", "#f8c4d2"]} titulo={`Almacenamiento › ${nombre}`} detalle="Imagen + texto" />
        )}
      </main>
      <Lateral titulo={T[paso][0]} detalle={T[paso][1]} registro={[]} />
    </div>
  );
}

/** Lo que ve un trabajador en su monitor. Por ahora es una vista previa animada, no el trabajo real. */
export function PantallaTrabajador({ clase, nombre, onSalir }: { clase: Clase; nombre: string; onSalir: () => void }) {
  return (
    <section className="pt-pantalla" aria-label={`Pantalla de ${nombre}`}>
      <header className="pt-barra">
        <button type="button" className="of-enlace" onClick={onSalir}>
          ← Salir de la sala
        </button>
        <strong>{nombre}</strong>
        <span className="pt-previa">Vista previa: cuando conectemos el motor, aquí verás el trabajo real paso a paso.</span>
      </header>
      {clase === "clips" ? <Clips /> : clase === "eventos" ? <Eventos /> : clase === "virales" ? <Virales /> : <Post nombre={infoClase[clase].nombre} />}
    </section>
  );
}
