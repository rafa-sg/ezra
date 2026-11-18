"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, RefreshCw, Save } from "lucide-react";
import type { PostIG } from "@/lib/granjas/instagram";
import { Modal } from "../ui";
import { pedir } from "./cliente";

type PostVista = PostIG & { evento: { id: string; titulo: string; fecha: string | null; hora: string | null; lugar: string; imagenAutorizada: boolean } };
const nombreArchivo = (p: PostVista) =>
  `post-${p.evento.fecha ?? "sin-fecha"}-${p.evento.titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}`;

/** Posts listos para subir a mano. Ezra no usa la API de Instagram. */
export function ListaPosts({ g, fecha }: { g: (clave: string) => string; fecha: (iso: string) => string }) {
  const [posts, setPosts] = useState<PostVista[] | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState<{ post: PostVista; url: string } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    pedir<{ posts: PostVista[] }>("/api/granjas/posts")
      .then((r) => {
        if (!vivo) return;
        setPosts(r.posts);
        setTextos(Object.fromEntries(r.posts.map((p) => [p.id, p.texto])));
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [version]);
  async function accion(cuerpo: object, exito: string) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      await pedir("/api/granjas/posts", cuerpo);
      setAviso(exito);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }
  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(g("p_textoCopiado"));
    } catch {
      setError(g("ev_copiaFallo"));
    }
  }
  if (!posts) return <p role="status">{error || g("cargando")}</p>;
  if (!posts.length) return <p className="ep-nota">{g("p_vacio")}</p>;
  return (
    <div className="eg-posts">
      {error && (
        <p className="ep-alerta" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ep-aviso" role="status">
          {aviso}
        </p>
      )}
      <ul className="eg-lista-posts">
        {posts.map((p) => {
          const texto = textos[p.id] ?? p.texto;
          return (
            <li key={p.id} className="eg-post">
              <div className="eg-post-imagen">
                {p.medioId ? (
                  // Medio local servido solo a la administración.
                  <img src={`/api/granjas/medios/${p.medioId}`} alt={`${g("p_imagenAlt")}: ${p.evento.titulo}`} width={1080} height={1350} loading="lazy" />
                ) : (
                  <span className="ep-nota">{g("p_estado_borrador")}</span>
                )}
              </div>
              <div className="eg-post-texto">
                <div className="eg-evento-cabecera">
                  <span className="ep-pill">{g(`p_estado_${p.estado}`)}</span>
                  <small className="ep-nota">
                    {p.cuenta} · {g(`p_origen_${p.textoOrigen === "ia" ? "ia" : p.textoOrigen === "manual" ? "manual" : "plantilla"}`)}
                  </small>
                </div>
                <h3>{p.evento.titulo}</h3>
                {p.nota && <p className="ep-nota">{p.nota}</p>}
                <label className="eg-campo">
                  <span className="eg-oculto">{g("p_copiar")}</span>
                  <textarea rows={10} maxLength={2200} value={texto} readOnly={p.estado === "subido"} onChange={(e) => setTextos({ ...textos, [p.id]: e.target.value })} />
                  <small>
                    {texto.length}/2200 {g("p_caracteres")}
                  </small>
                </label>
                {p.igUrl && (
                  <p className="ep-nota">
                    <a href={p.igUrl} target="_blank" rel="noreferrer noopener">
                      {g("p_verEnIG")} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    {p.subido ? ` · ${fecha(p.subido)}` : ""}
                  </p>
                )}
                <div className="ep-acciones eg-evento-acciones">
                  <button className="ep-boton" onClick={() => void copiar(texto)}>
                    <Copy size={15} />
                    {g("p_copiar")}
                  </button>
                  {p.medioId && (
                    <a className="ep-boton" href={`/api/granjas/medios/${p.medioId}?descargar=${nombreArchivo(p)}`}>
                      <Download size={15} />
                      {g("p_descargar")}
                    </a>
                  )}
                  {p.estado !== "subido" && texto !== p.texto && (
                    <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "texto", id: p.id, revision: p.revision, texto }, g("p_guardado"))}>
                      <Save size={15} />
                      {g("p_guardarTexto")}
                    </button>
                  )}
                  {p.estado !== "subido" && (
                    <button className="ep-boton" disabled={ocupado} onClick={() => void accion({ accion: "redisenar", id: p.id }, g("p_guardado"))}>
                      <RefreshCw size={15} />
                      {g("p_redisenar")}
                    </button>
                  )}
                  {p.estado === "listo" && (
                    <button className="ep-boton ep-primario" disabled={ocupado} onClick={() => setSubiendo({ post: p, url: "" })}>
                      <Check size={15} />
                      {g("p_marcarSubido")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Modal open={Boolean(subiendo)} onClose={() => setSubiendo(null)} label={g("p_marcarSubido")} className="ep-modal" dismissOnBackdrop>
        {subiendo && (
          <form
            className="eg-guia"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await accion({ accion: "subido", id: subiendo.post.id, revision: subiendo.post.revision, url: subiendo.url }, g("p_estado_subido"));
              if (ok) setSubiendo(null);
            }}
          >
            <h2>{g("p_marcarSubido")}</h2>
            <label className="eg-campo">
              {g("p_enlace")}
              <input type="url" required maxLength={500} placeholder="https://www.instagram.com/p/…" value={subiendo.url} onChange={(e) => setSubiendo({ ...subiendo, url: e.target.value })} />
            </label>
            <p className="ep-nota">{g("p_enlaceAyuda")}</p>
            <div className="ep-acciones">
              <button className="ep-boton ep-primario" disabled={ocupado || !subiendo.url.startsWith("https://")}>
                {g("p_marcarSubido")}
              </button>
              <button type="button" className="ep-boton" onClick={() => setSubiendo(null)}>
                {g("cancelar")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
