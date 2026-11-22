import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../store";

/**
 * Base local de las granjas. SQLite en modo WAL con transacciones inmediatas:
 * a diferencia del JSON con cola por proceso, protege también al trabajador
 * que corre en otro proceso. Sigue siendo almacenamiento local de esta Mac.
 */
// Rutas de datos del usuario: el empaquetador no debe rastrearlas (podría recorrer todo el proyecto).
export const carpetaGranjas = path.join(/* turbopackIgnore: true */ dataDirectory, "granjas");
export const archivoBase = path.join(/* turbopackIgnore: true */ carpetaGranjas, "granjas.sqlite");
export const carpetaMedios = path.join(/* turbopackIgnore: true */ carpetaGranjas, "medios");
export const carpetaRespaldos = path.join(/* turbopackIgnore: true */ carpetaGranjas, "respaldos");

const migraciones: string[] = [
  `
  create table granjas (
    id text primary key,
    nombre text not null,
    objetivo text not null default '',
    formato text not null,
    canales text not null,
    politica_fuentes text not null,
    ajustes text not null,
    grafo text not null,
    estado text not null check (estado in ('activa', 'pausada', 'archivada')),
    revision integer not null,
    receta text,
    creado text not null,
    actualizado text not null
  );
  create table granja_revisiones (
    granja_id text not null references granjas(id),
    revision integer not null,
    grafo text not null,
    motivo text not null,
    creado text not null,
    primary key (granja_id, revision)
  );
  create table ejecuciones (
    id text primary key,
    granja_id text not null references granjas(id),
    revision_granja integer not null,
    instantanea text not null,
    estado text not null,
    alcance text not null,
    consentimiento text not null,
    creado text not null,
    actualizado text not null,
    terminado text
  );
  create index ejecuciones_granja on ejecuciones (granja_id, creado desc);
  create table pasos (
    id text primary key,
    ejecucion_id text not null references ejecuciones(id),
    nodo_id text not null,
    estado text not null,
    proveedor text not null,
    intentos integer not null default 0,
    entradas text not null default '[]',
    salidas text not null default '[]',
    error text not null default '',
    detalle text not null default '',
    pieza_id text,
    inicio text,
    fin text,
    actualizado text not null,
    unique (ejecucion_id, nodo_id)
  );
  create table medios (
    id text primary key,
    sha256 text not null unique,
    mime text not null,
    bytes integer not null,
    archivo text not null,
    ancho integer,
    alto integer,
    duracion real,
    procedencia text not null,
    licencia text not null default '',
    generado integer not null default 0,
    nombre text not null default '',
    creado text not null
  );
  create table artefactos (
    id text primary key,
    granja_id text not null references granjas(id),
    ejecucion_id text references ejecuciones(id),
    paso_id text references pasos(id),
    nodo_id text not null,
    tipo text not null,
    version integer not null,
    contenido text not null default '',
    medio_id text references medios(id),
    procedencia text not null,
    config_nodo text not null,
    hash text not null,
    reemplaza text,
    estado text not null default 'vigente' check (estado in ('vigente', 'reemplazado')),
    creado text not null
  );
  create index artefactos_nodo on artefactos (granja_id, nodo_id, creado desc);
  create table aprobaciones (
    id text primary key,
    objeto text not null check (objeto in ('paso', 'pieza')),
    objeto_id text not null,
    hash text not null,
    comprobaciones text not null,
    estado text not null check (estado in ('vigente', 'invalidada')),
    motivo text not null default '',
    creado text not null,
    invalidada text
  );
  create index aprobaciones_objeto on aprobaciones (objeto, objeto_id);
  create table trabajos (
    id text primary key,
    tipo text not null,
    carga text not null,
    ejecucion_id text,
    estado text not null check (estado in ('pendiente', 'tomado', 'hecho', 'fallido', 'cancelado')),
    disponible_desde text not null,
    intentos integer not null default 0,
    max_intentos integer not null default 3,
    arrendatario text,
    arriendo_hasta text,
    error text not null default '',
    clave text unique,
    creado text not null,
    actualizado text not null
  );
  create index trabajos_cola on trabajos (estado, disponible_desde);
  create table usos_ia (
    id text primary key,
    fecha text not null,
    paso_id text not null,
    proveedor text not null
  );
  create table conexiones (
    canal text primary key,
    estado text not null,
    identidad text not null default '{}',
    capacidades text not null default '[]',
    permisos text not null default '[]',
    opciones text not null default '[]',
    token_cifrado text,
    expira text,
    verificado text,
    ultimo_error text not null default '',
    ultimo_error_fecha text,
    actualizado text not null
  );
  create table estados_oauth (
    estado text primary key,
    canal text not null,
    usuario text not null,
    creado text not null,
    expira text not null
  );
  create table piezas (
    id text primary key,
    granja_id text not null references granjas(id),
    ejecucion_id text references ejecuciones(id),
    paso_id text references pasos(id),
    version integer not null,
    contenido text not null,
    hash text not null,
    creado text not null,
    actualizado text not null
  );
  create table pieza_versiones (
    pieza_id text not null references piezas(id),
    version integer not null,
    contenido text not null,
    hash text not null,
    creado text not null,
    primary key (pieza_id, version)
  );
  create table autorizaciones (
    id text primary key,
    pieza_id text not null references piezas(id),
    hash text not null,
    destinos text not null,
    estado text not null check (estado in ('vigente', 'usada', 'revocada', 'vencida')),
    usuario text not null,
    creado text not null,
    expira text not null,
    motivo text not null default ''
  );
  create table recibos (
    id text primary key,
    autorizacion_id text not null references autorizaciones(id),
    pieza_id text not null references piezas(id),
    hash text not null,
    canal text not null,
    cuenta_id text not null,
    cuenta_nombre text not null,
    clave_idempotencia text not null unique,
    estado text not null,
    remoto_id text,
    contenedor_id text,
    enlace text,
    error text not null default '',
    intentos integer not null default 0,
    creado text not null,
    actualizado text not null
  );
  create table auditoria (
    id integer primary key autoincrement,
    fecha text not null,
    accion text not null,
    objeto text not null,
    detalle text not null default '{}'
  );
  `,
  `
  create table guide_versions (
    farm_id text not null references granjas(id),
    version integer not null,
    content text not null,
    hash text not null,
    checks text not null default '{}',
    approved_at text,
    created_at text not null,
    primary key (farm_id, version)
  );
  `,
  // 3 · Consumo de Gemini y ajustes del estudio (presupuesto, tarifas, especialistas visibles).
  `
  create table ajustes_estudio (
    clave text primary key,
    valor text not null,
    actualizado text not null
  );
  create table consumo_ia (
    id text primary key,
    fecha text not null,
    origen text not null,
    granja_id text,
    ejecucion_id text,
    paso_id text,
    paso text not null default '',
    modelo text not null,
    prompt_tokens integer not null default 0,
    candidatos_tokens integer not null default 0,
    pensamiento_tokens integer not null default 0,
    herramientas_tokens integer not null default 0,
    total_tokens integer not null default 0,
    busqueda integer not null default 0,
    consultas_busqueda integer not null default 0,
    duracion_ms integer not null default 0,
    error text not null default ''
  );
  create index consumo_ia_fecha on consumo_ia (fecha);
  `,
  // 4 · Bandeja de eventos de El Salvador. Fecha, hora y precio nulos = «por confirmar».
  `
  create table eventos (
    id text primary key,
    titulo text not null,
    fecha text,
    hora text,
    lugar text not null default '',
    municipio text not null default '',
    departamento text not null default '',
    categoria text not null default 'otro',
    precio text,
    boletos_url text,
    fuente_url text not null,
    confirmado_en text not null default '{}',
    sugerencias text not null default '{}',
    descripcion text not null default '',
    imagen_url text,
    imagen_medio_id text references medios(id),
    imagen_permiso text not null default '',
    estado text not null check (estado in ('nuevo', 'aprobado', 'descartado')),
    motivo_descarte text not null default '',
    spotmi_estado text check (spotmi_estado in ('propuesto', 'aceptado', 'descartado', 'duplicado')),
    spotmi_propuesta_id text,
    spotmi_clave text,
    spotmi_consultado text,
    ig_estado text check (ig_estado in ('post_listo', 'subido')),
    huella text not null,
    nota_verificacion text not null default '',
    granja_id text references granjas(id),
    ejecucion_id text references ejecuciones(id),
    revision integer not null default 1,
    creado text not null,
    actualizado text not null
  );
  create index eventos_estado on eventos (estado, fecha);
  create index eventos_creado on eventos (creado);
  `,
  // 5 · Posts de Instagram (se suben a mano) y horario diario de cada granja.
  `
  create table posts_ig (
    id text primary key,
    evento_id text not null references eventos(id),
    granja_id text references granjas(id),
    ejecucion_id text references ejecuciones(id),
    cuenta text not null,
    texto text not null default '',
    texto_origen text not null default '',
    nota text not null default '',
    medio_id text references medios(id),
    estado text not null check (estado in ('borrador', 'listo', 'subido')),
    ig_url text,
    subido text,
    revision integer not null default 1,
    creado text not null,
    actualizado text not null
  );
  create unique index posts_ig_evento on posts_ig (evento_id);
  create table horarios (
    granja_id text primary key references granjas(id),
    activa integer not null default 0,
    hora text not null default '04:30',
    dias text not null default '[0,1,2,3,4,5,6]',
    despues_de text references granjas(id),
    consentimiento text,
    ultima_fecha text,
    ultima_ejecucion_id text,
    ultimo_inicio text,
    ultimo_error text not null default '',
    pausa_motivo text not null default '',
    pausa_hasta text,
    actualizado text not null
  );
  `,
  // 6 · Eventos de varios días (fecha_fin) e imagen de la fuente pendiente de confirmar.
  // Una imagen guardada antes con permiso escrito por el propietario ya estaba confirmada.
  `
  alter table eventos add column fecha_fin text;
  alter table eventos add column imagen_confirmada integer not null default 0;
  update eventos set imagen_confirmada = 1 where imagen_medio_id is not null and imagen_permiso <> '';
  `,
  // 7 · Todas las URL donde apareció cada evento, su origen de entrada, la confianza
  // calculada (instantánea; se recalcula al leer) y el historial de cambios de fecha, lugar o precio.
  // Los eventos existentes conservan su fuente como primera fila; lo confirmado sale de confirmado_en.
  `
  create table evento_fuentes (
    id text primary key,
    evento_id text not null references eventos(id) on delete cascade,
    url text not null,
    via text not null check (via in ('web', 'instagram', 'facebook', 'manual', 'desconocido')),
    cuenta text not null default '',
    publicado text,
    leido text not null,
    campos text not null default '[]',
    datos text not null default '{}',
    imagen_url text,
    unique (evento_id, url)
  );
  create index evento_fuentes_evento on evento_fuentes (evento_id);
  alter table eventos add column origen text not null default 'desconocido';
  alter table eventos add column confianza integer;
  alter table eventos add column confianza_desglose text not null default '[]';
  alter table eventos add column cambios text not null default '[]';
  update eventos set origen = case when ejecucion_id is not null then 'cazador' else 'importacion' end;
  insert into evento_fuentes (id, evento_id, url, via, leido, campos, datos)
    select lower(hex(randomblob(16))), id, fuente_url, 'web', creado,
      coalesce((select json_group_array(key) from json_each(eventos.confirmado_en) where value <> 'propietario'), '[]'),
      json_object('fecha', fecha, 'hora', hora, 'lugar', lugar, 'precio', precio)
    from eventos;
  `,
  // 8 · Tipo de imagen (afiche oficial, post de cuenta oficial, foto de prensa o referencia IA),
  // baja resolución, precio «desde» (instantánea) e historial de imágenes de cada evento.
  // Las imágenes ya guardadas de notas de prensa pasan a «foto de prensa».
  `
  alter table eventos add column imagen_tipo text check (imagen_tipo in ('afiche', 'red', 'prensa', 'ia'));
  alter table eventos add column imagen_baja integer not null default 0;
  alter table eventos add column precio_desde real;
  create table evento_imagenes (
    id text primary key,
    evento_id text not null references eventos(id) on delete cascade,
    medio_id text references medios(id),
    tipo text not null check (tipo in ('afiche', 'red', 'prensa', 'ia')),
    url text,
    permiso text not null default '',
    ia text,
    nota text not null default '',
    creado text not null
  );
  create index evento_imagenes_evento on evento_imagenes (evento_id, creado);
  update eventos set imagen_tipo = case
      when imagen_medio_id is null then null
      when imagen_url like '%elsalvador.com/%' or imagen_url like '%laprensagrafica.com/%' or imagen_url like '%elmundo.sv/%' or imagen_url like '%diarioelsalvador.com/%' then 'prensa'
      else 'afiche' end;
  update eventos set imagen_permiso = replace(imagen_permiso, 'Imagen promocional de la fuente oficial:', 'Foto de prensa:') where imagen_tipo = 'prensa';
  insert into evento_imagenes (id, evento_id, medio_id, tipo, url, permiso, nota, creado)
    select lower(hex(randomblob(16))), id, imagen_medio_id, imagen_tipo, imagen_url, imagen_permiso, 'Imagen existente al migrar.', actualizado
    from eventos where imagen_medio_id is not null;
  `,
  // 9 · Origen de la imagen: publicación original (Instagram/Facebook), captura, fotograma o referencia IA,
  // con la publicación de origen, la plataforma, la cuenta (y si se verificó por API) y cuándo se recuperó.
  `
  alter table eventos add column imagen_origen text;
  alter table eventos add column imagen_publicacion_url text;
  alter table eventos add column imagen_plataforma text;
  alter table eventos add column imagen_cuenta text;
  alter table eventos add column imagen_cuenta_verificada integer not null default 0;
  alter table eventos add column imagen_recuperada text;
  alter table evento_imagenes add column origen text;
  alter table evento_imagenes add column plataforma text;
  alter table evento_imagenes add column cuenta text;
  alter table evento_imagenes add column publicacion_url text;
  update eventos set imagen_origen = case imagen_tipo when 'ia' then 'ia' when 'prensa' then 'prensa' when 'red' then 'original' when 'afiche' then 'web' else null end
    where imagen_medio_id is not null;
  `,
  // 10 · Director de arte: el diseño elegido (JSON), quién lo hizo y las láminas del carrusel.
  `
  alter table posts_ig add column diseno text;
  alter table posts_ig add column diseno_origen text;
  alter table posts_ig add column carrusel text not null default '[]';
  alter table posts_ig add column diseno_nota text not null default '';
  `,
  // 11 · Video vertical del post: el MP4, su guion (JSON), quién lo escribió y la nota.
  `
  alter table posts_ig add column video_medio_id text references medios(id);
  alter table posts_ig add column video_guion text;
  alter table posts_ig add column video_origen text;
  alter table posts_ig add column video_nota text not null default '';
  `,
  // 12 · Granja Clips: permiso de cada medio (propio o con permiso del autor) y los clips propuestos,
  // con su versión, su medio renderizado, su pieza (vista previa por destino) y la decisión del propietario.
  `
  alter table medios add column permiso text;
  create table clips (
    id text primary key,
    granja_id text not null references granjas(id),
    ejecucion_id text not null references ejecuciones(id),
    paso_id text not null references pasos(id),
    origen_medio_id text not null references medios(id),
    numero integer not null,
    version integer not null default 1,
    inicio real not null,
    fin real not null,
    titulo text not null,
    gancho text not null default '',
    subtitulos text not null default '[]',
    medio_id text references medios(id),
    pieza_id text references piezas(id),
    estado text not null check (estado in ('renderizando', 'por_revisar', 'aprobado', 'rechazado', 'cambios', 'fallido')),
    motivo text not null default '',
    error text not null default '',
    creado text not null,
    actualizado text not null
  );
  create index clips_ejecucion on clips (ejecucion_id, numero);
  `,
  // 13 · Equipo: el espacio Spotmi y sus miembros (propietario, socios e invitados). Solo se entra por
  // invitación; todo lo que ya existía queda en el espacio «spotmi».
  `
  create table espacios (
    id text primary key,
    nombre text not null,
    creado text not null
  );
  insert into espacios (id, nombre, creado) values ('spotmi', 'Spotmi', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  create table miembros (
    id text primary key,
    espacio_id text not null references espacios(id),
    email text not null,
    nombre text not null default '',
    rol text not null check (rol in ('propietario', 'socio', 'invitado')),
    secciones text not null default '[]',
    solo_lectura integer not null default 0,
    clerk_user_id text unique,
    estado text not null check (estado in ('invitado', 'activo', 'retirado')),
    invitacion_id text,
    invitado_por text,
    creado text not null,
    actualizado text not null,
    ultimo_acceso text,
    unique (espacio_id, email)
  );
  `,
  // 14 · Varias cuentas por red: una fila por cuenta, con id propio, alcance (compartida del espacio o
  // personal de un miembro) y dueño. La fila que existía de cada red pasa a ser la compartida de Spotmi.
  `
  alter table conexiones rename to conexiones_v13;
  create table conexiones (
    id text primary key,
    espacio_id text not null default 'spotmi' references espacios(id),
    canal text not null,
    alcance text not null check (alcance in ('compartida', 'personal')),
    dueno_id text references miembros(id),
    conectado_por text,
    cuenta_id text not null default '',
    estado text not null,
    identidad text not null default '{}',
    capacidades text not null default '[]',
    permisos text not null default '[]',
    opciones text not null default '[]',
    token_cifrado text,
    expira text,
    verificado text,
    ultimo_error text not null default '',
    ultimo_error_fecha text,
    creado text not null,
    actualizado text not null,
    check ((alcance = 'personal') = (dueno_id is not null))
  );
  insert into conexiones (id, espacio_id, canal, alcance, dueno_id, conectado_por, cuenta_id, estado, identidad, capacidades, permisos,
    opciones, token_cifrado, expira, verificado, ultimo_error, ultimo_error_fecha, creado, actualizado)
  select substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12),
    'spotmi', canal, 'compartida', null, null, coalesce(json_extract(identidad, '$.id'), ''), estado, identidad, capacidades, permisos,
    opciones, token_cifrado, expira, verificado, ultimo_error, ultimo_error_fecha, actualizado, actualizado
  from (select lower(hex(randomblob(16))) as h, * from conexiones_v13);
  drop table conexiones_v13;
  create unique index conexiones_cuenta on conexiones (espacio_id, canal, alcance, coalesce(dueno_id, ''), cuenta_id);
  create index conexiones_dueno on conexiones (dueno_id);
  alter table estados_oauth add column alcance text not null default 'compartida';
  alter table estados_oauth add column miembro_id text;
  create table oauth_errores (
    ambito text not null,
    canal text not null,
    mensaje text not null,
    fecha text not null,
    primary key (ambito, canal)
  );
  alter table recibos add column conexion_id text;
  update recibos set conexion_id = (select c.id from conexiones c where c.canal = recibos.canal and c.cuenta_id = recibos.cuenta_id limit 1);
  `,
];

export const versionEsquema = migraciones.length;
type Globales = typeof globalThis & {
  ezraGranjasBases?: Map<string, DatabaseSync>;
  ezraGranjasProfundidad?: number;
};
const globales = globalThis as Globales;

function migrar(db: DatabaseSync) {
  const actual = Number(
    (db.prepare("pragma user_version").get() as { user_version: number }).user_version,
  );
  if (actual > migraciones.length)
    throw new Error("La base de granjas es de una versión más nueva de Ezra. Se dejó intacta.");
  if (actual === migraciones.length) return;
  // Antes de cambiar una base existente se guarda una copia recuperable.
  if (actual > 0) {
    mkdirSync(carpetaRespaldos, { recursive: true, mode: 0o700 });
    const destino = path.join(
      carpetaRespaldos,
      `granjas-v${actual}-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
    );
    db.prepare("vacuum into ?").run(destino);
  }
  for (let version = actual; version < migraciones.length; version++) {
    db.exec("begin immediate");
    try {
      db.exec(migraciones[version]);
      db.exec(`pragma user_version = ${version + 1}`);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }
}

export function base(): DatabaseSync {
  const bases = (globales.ezraGranjasBases ??= new Map());
  const abierta = bases.get(archivoBase);
  if (abierta) return abierta;
  mkdirSync(carpetaGranjas, { recursive: true, mode: 0o700 });
  mkdirSync(carpetaMedios, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(archivoBase);
  db.exec(
    "pragma journal_mode = wal; pragma busy_timeout = 8000; pragma foreign_keys = on; pragma synchronous = normal;",
  );
  migrar(db);
  bases.set(archivoBase, db);
  return db;
}

/** Transacción inmediata: dos procesos nunca intercalan una lectura y su escritura. */
export function transaccion<T>(trabajo: (db: DatabaseSync) => T): T {
  const db = base();
  if (globales.ezraGranjasProfundidad) return trabajo(db);
  db.exec("begin immediate");
  globales.ezraGranjasProfundidad = 1;
  try {
    const resultado = trabajo(db);
    db.exec("commit");
    return resultado;
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    globales.ezraGranjasProfundidad = 0;
  }
}

export const ahoraIso = () => new Date().toISOString();
export const json = <T>(texto: string | null | undefined, defecto: T): T => {
  if (!texto) return defecto;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return defecto;
  }
};
export function auditar(accion: string, objeto: string, detalle: object = {}) {
  base()
    .prepare("insert into auditoria (fecha, accion, objeto, detalle) values (?, ?, ?, ?)")
    .run(ahoraIso(), accion, objeto, JSON.stringify(detalle));
}

/** Copia consistente de la base para respaldos, sin detener el servidor. */
export function copiarBase(destino: string) {
  base().prepare("vacuum into ?").run(destino);
}
