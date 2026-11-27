-- ═══════════════════════════════════════════════════════════════════════════
-- Integración Ezra → Spotmi · PRODUCCIÓN (spotmi.com.sv · bvmzrmvrdbfpkdhwazgv)
-- Preparada el 27 nov 2026 a partir del esquema real de producción.
--
-- Qué hace:
--   1. Bandeja editorial de Ezra (20261103): cuentas editoriales, propuestas con
--      clave de idempotencia y funciones para proponer y consultar.
--   2. Publicación directa (20261125 + corrección 202611250001).
--   3. NUEVO: actualizar sólo la portada de un evento publicado que no tiene imagen.
--
-- Qué NO hace:
--   - No borra filas, tablas ni funciones. No cambia datos existentes.
--   - No crea usuarios ni habilita ninguna cuenta editorial (puede_publicar = false).
--   - No aplica el endurecimiento 20261117 de verification_count: la regla de
--     verificación de producción se conserva tal cual, con sólo dos excepciones
--     nuevas y acotadas para Ezra (insertar un evento publicado por su RPC y
--     cambiar sólo la portada desde su RPC).
--
-- Reemplaza (no borra datos):
--   - La restricción event_proposals_origin_check: se vuelve a crear para admitir
--     el origen 'ezra' además de 'community' y 'analyzer'.
--   - La función proteger_verificacion_evento(): mismo cuerpo de producción más
--     las dos excepciones de Ezra.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.events') is null or to_regclass('public.event_proposals') is null then
    raise exception 'Faltan las tablas base de Spotmi; se canceló la instalación.';
  end if;
  if to_regclass('public.ezra_clientes_editoriales') is not null
    or to_regclass('public.ezra_publicaciones') is not null
    or to_regclass('public.ezra_portadas') is not null then
    raise exception 'La integración ya existe; revisar antes de volver a instalar.';
  end if;
  if to_regprocedure('public.es_fundador()') is null or to_regprocedure('public.puede_editar_contenido()') is null then
    raise exception 'Faltan funciones de administración de Spotmi.';
  end if;
end;
$$;

-- ═══ 1 · Bandeja editorial (20261103) ═══

create table public.ezra_clientes_editoriales (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  activo boolean not null default true,
  puede_publicar boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ezra_clientes_editoriales enable row level security;
revoke all on public.ezra_clientes_editoriales from public, anon, authenticated;
grant select on public.ezra_clientes_editoriales to authenticated;
create policy ezra_clientes_lectura_fundador on public.ezra_clientes_editoriales
  for select to authenticated using ((select public.es_fundador()));

-- REEMPLAZA la restricción de origen para admitir 'ezra' (las filas actuales siguen válidas).
alter table public.event_proposals drop constraint event_proposals_origin_check;
alter table public.event_proposals add constraint event_proposals_origin_check
  check (origin in ('community', 'analyzer', 'ezra'));
alter table public.event_proposals
  add column editorial_user_id uuid references auth.users(id),
  add column idempotency_key text unique,
  add constraint event_proposals_idempotencia_longitud
    check (idempotency_key is null or char_length(idempotency_key) between 45 and 240),
  add constraint event_proposals_cliente_ezra
    check ((origin = 'ezra' and editorial_user_id is not null and idempotency_key is not null)
       or (origin <> 'ezra' and editorial_user_id is null and idempotency_key is null));
create index event_proposals_editorial_fecha
  on public.event_proposals(editorial_user_id, created_at) where origin = 'ezra';
revoke insert, update, delete, truncate on public.event_proposals from anon, authenticated;

create function public.es_cliente_editorial_ezra()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.role() = 'authenticated' and exists (
    select 1 from public.ezra_clientes_editoriales
    where user_id = (select auth.uid()) and activo
  );
$$;
revoke all on function public.es_cliente_editorial_ezra() from public, anon;
grant execute on function public.es_cliente_editorial_ezra() to authenticated;

create function public.ezra_puede_publicar()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.role() = 'authenticated' and exists (
    select 1 from public.ezra_clientes_editoriales
    where user_id = auth.uid() and activo and puede_publicar
  );
$$;
revoke all on function public.ezra_puede_publicar() from public, anon;
grant execute on function public.ezra_puede_publicar() to authenticated;

-- Sólo un founder habilita cuentas editoriales; darla de alta no la hace admin de Spotmi.
create function public.ezra_configurar_cliente(usuario uuid, nombre text, activo boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'authenticated' or not public.es_fundador() then
    raise exception 'Sólo un founder puede habilitar cuentas editoriales.' using errcode = '42501';
  end if;
  if usuario is null or nombre is null or char_length(btrim(nombre)) not between 2 and 120 or activo is null then
    raise exception 'Revisa la cuenta, su nombre y su estado.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = usuario and email_confirmed_at is not null) then
    raise exception 'La cuenta debe existir y tener su correo confirmado.' using errcode = '22023';
  end if;
  insert into public.ezra_clientes_editoriales(user_id, nombre, activo, created_by)
  values (usuario, btrim(nombre), activo, auth.uid())
  on conflict (user_id) do update set nombre = excluded.nombre, activo = excluded.activo, updated_at = now();
  return jsonb_build_object('usuario', usuario, 'activo', activo);
end;
$$;
revoke all on function public.ezra_configurar_cliente(uuid, text, boolean) from public, anon;
grant execute on function public.ezra_configurar_cliente(uuid, text, boolean) to authenticated;

create function public.ezra_identidad_editorial()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'Inicia sesión con la cuenta editorial de Spotmi.' using errcode = '42501';
  end if;
  return jsonb_build_object('usuario', auth.uid(), 'correo', auth.jwt()->>'email',
    'activo', public.es_cliente_editorial_ezra(), 'puede_publicar', public.ezra_puede_publicar());
end;
$$;
revoke all on function public.ezra_identidad_editorial() from public, anon;
grant execute on function public.ezra_identidad_editorial() to authenticated;

create function public.ezra_proponer_evento(datos jsonb, fuente_url text, clave text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  quien uuid := auth.uid();
  dia date;
  limpia jsonb;
  llave text;
  existente public.event_proposals%rowtype;
  propuesta uuid;
begin
  if auth.role() is distinct from 'authenticated' or not public.es_cliente_editorial_ezra() then
    raise exception 'La cuenta no está habilitada para enviar propuestas de Ezra.' using errcode = '42501';
  end if;
  if datos is null or jsonb_typeof(datos) <> 'object' or octet_length(datos::text) > 12000
    or exists (select 1 from jsonb_object_keys(datos) k
               where k not in ('titulo','fecha','hora','lugar','municipio','departamento','categoria','descripcion')) then
    raise exception 'La propuesta sólo admite título, fecha, hora, lugar, municipio, departamento, categoría y descripción.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(datos) e where jsonb_typeof(e.value) not in ('string','null'))
    or coalesce(char_length(btrim(datos->>'titulo')), 0) not between 3 and 160
    or coalesce(char_length(btrim(datos->>'lugar')), 0) not between 1 and 200
    or coalesce(char_length(datos->>'descripcion'), 0) > 5000
    or coalesce(char_length(datos->>'departamento'), 0) > 80
    or coalesce(char_length(datos->>'municipio'), 0) > 120 then
    raise exception 'Revisa el título, el lugar y la longitud de los textos.' using errcode = '22023';
  end if;
  if nullif(btrim(datos->>'hora'), '') is not null and (datos->>'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Indica la hora en formato HH:MM (24 horas).' using errcode = '22023';
  end if;
  if nullif(btrim(datos->>'categoria'), '') is not null and datos->>'categoria' not in (
    'feria','gastronomia','cultura','deporte','religioso','musica','otro') then
    raise exception 'La categoría no es válida.' using errcode = '22023';
  end if;
  if datos->>'fecha' is null or (datos->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Indica una fecha válida en formato AAAA-MM-DD.' using errcode = '22023';
  end if;
  begin
    dia := (datos->>'fecha')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'La fecha no existe.' using errcode = '22023';
  end;
  if dia < (now() at time zone 'America/El_Salvador')::date then
    raise exception 'No envíes como próximo un evento que ya pasó.' using errcode = '22023';
  end if;
  if fuente_url is null or char_length(fuente_url) > 500
    or fuente_url !~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$' then
    raise exception 'La fuente debe ser un enlace HTTPS sin credenciales.' using errcode = '22023';
  end if;
  if clave is null or char_length(clave) not between 8 and 200 or clave !~ '^[a-zA-Z0-9:_-]+$' then
    raise exception 'Falta una clave de idempotencia válida.' using errcode = '22023';
  end if;
  if nullif(btrim(datos->>'departamento'), '') is not null and datos->>'departamento' not in (
    'Ahuachapán','Cabañas','Chalatenango','Cuscatlán','La Libertad','La Paz','La Unión',
    'Morazán','San Miguel','San Salvador','San Vicente','Santa Ana','Sonsonate','Usulután') then
    raise exception 'El departamento no es válido.' using errcode = '22023';
  end if;
  limpia := jsonb_build_object(
    'titulo', btrim(datos->>'titulo'),
    'fecha', to_char(dia, 'YYYY-MM-DD') || 'T' || coalesce(nullif(btrim(datos->>'hora'), ''), '00:00') || ':00-06:00',
    'lugar', btrim(datos->>'lugar'),
    'municipio', nullif(btrim(datos->>'municipio'), ''),
    'departamento', nullif(btrim(datos->>'departamento'), ''),
    'categoria', nullif(btrim(datos->>'categoria'), ''),
    'descripcion', coalesce(datos->>'descripcion', '')
  );
  llave := quien::text || ':' || clave;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ezra:' || quien::text, 0));
  select * into existente from public.event_proposals where idempotency_key = llave;
  if found then
    if existente.editorial_user_id <> quien or existente.data <> limpia or existente.source_url <> fuente_url then
      raise exception 'La clave ya se utilizó con otro contenido.' using errcode = '22023';
    end if;
    return jsonb_build_object('id', existente.id, 'estado', existente.status);
  end if;
  if (select count(*) from public.event_proposals where editorial_user_id = quien and origin = 'ezra'
      and created_at >= (((now() at time zone 'America/El_Salvador')::date)::timestamp at time zone 'America/El_Salvador')) >= 100 then
    raise exception 'Se alcanzó el límite diario de 100 propuestas de esta cuenta.' using errcode = '54000';
  end if;
  insert into public.event_proposals(origin, status, data, source_url, editorial_user_id, idempotency_key)
  values ('ezra', 'pending', limpia, fuente_url, quien, llave) returning id into propuesta;
  return jsonb_build_object('id', propuesta, 'estado', 'pending');
end;
$$;
revoke all on function public.ezra_proponer_evento(jsonb, text, text) from public, anon;
grant execute on function public.ezra_proponer_evento(jsonb, text, text) to authenticated;

create function public.ezra_estado_propuesta(propuesta uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  fila public.event_proposals%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or not public.es_cliente_editorial_ezra() then
    raise exception 'La cuenta editorial no está habilitada.' using errcode = '42501';
  end if;
  select * into fila from public.event_proposals
    where id = propuesta and origin = 'ezra' and editorial_user_id = auth.uid();
  if not found then
    raise exception 'No se encontró una propuesta de esta cuenta.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', fila.id, 'estado', fila.status, 'evento', fila.event_id);
end;
$$;
revoke all on function public.ezra_estado_propuesta(uuid) from public, anon;
grant execute on function public.ezra_estado_propuesta(uuid) to authenticated;

-- ═══ 2 · Recibos privados y portadas en el bucket ═══

create table public.ezra_publicaciones (
  user_id uuid not null references auth.users(id),
  clave text not null,
  contenido jsonb not null,
  propuesta_id uuid not null references public.event_proposals(id),
  evento_id uuid not null references public.events(id),
  created_at timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.ezra_publicaciones enable row level security;
revoke all on public.ezra_publicaciones from public, anon, authenticated;

create table public.ezra_portadas (
  user_id uuid not null references auth.users(id),
  clave text not null,
  evento_id uuid not null references public.events(id),
  portada_ruta text not null,
  portada_url text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.ezra_portadas enable row level security;
revoke all on public.ezra_portadas from public, anon, authenticated;

-- Sólo archivos nuevos bajo la carpeta de la propia cuenta, con nombre = huella SHA-256.
create policy eventos_subir_ezra on storage.objects for insert to authenticated
with check (
  bucket_id = 'eventos' and (select public.ezra_puede_publicar())
  and name ~ ('^ezra/' || auth.uid()::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
);

-- ═══ 3 · Regla de verificación: la de producción + dos excepciones de Ezra ═══
-- REEMPLAZA proteger_verificacion_evento(). Todo lo que no es Ezra sigue igual.
create or replace function public.proteger_verificacion_evento()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
declare
  desde_el_panel boolean := current_user not in ('authenticated', 'anon');
  portada text;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Ezra (nuevo): evento creado por ezra_publicar_evento con propuesta de ESTA cuenta.
  if tg_op = 'INSERT' and desde_el_panel
     and public.ezra_puede_publicar()
     and new.source = 'official' and new.is_verified
     and new.source_id = 'ezra:' || current_setting('spotmi.ezra_publicacion', true)
     and exists (select 1 from public.event_proposals p
       where p.id::text = current_setting('spotmi.ezra_publicacion', true)
         and p.origin = 'ezra' and p.editorial_user_id = auth.uid() and p.status = 'pending') then
    new.verification_count := 0;
    return new;
  end if;

  -- Ezra (nuevo): ezra_actualizar_portada sólo cambia cover_image_url; el resto queda como estaba.
  if tg_op = 'UPDATE' and desde_el_panel
     and public.ezra_puede_publicar()
     and current_setting('spotmi.ezra_portada', true) = old.id::text then
    portada := new.cover_image_url;
    new := old;
    new.cover_image_url := portada;
    return new;
  end if;

  -- Desde aquí, idéntico a producción (27 nov 2026).
  if tg_op = 'INSERT'
     and desde_el_panel
     and current_setting('spotmi.evento_por_admin', true) = 'on'
     and public.puede_editar_contenido() then
    return new;
  end if;

  if tg_op = 'UPDATE' and desde_el_panel and public.puede_editar_contenido() then
    new.source := old.source;
    new.source_id := old.source_id;
    new.source_url := old.source_url;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.source := 'community';
    new.source_id := null;
    new.source_url := null;
  else
    if new.is_verified and not old.is_verified then
      raise exception 'solo el equipo verifica eventos' using errcode = '42501';
    elsif old.is_verified then
      new.is_verified := false;
    end if;
    new.source := old.source;
    new.source_id := old.source_id;
    new.source_url := old.source_url;
  end if;
  return new;
end;
$function$;

-- ═══ 4 · Publicación directa (20261125 con la corrección 202611250001) ═══

create function public.ezra_publicar_evento(
  datos jsonb, fuente_url text, clave text, fecha_fin text default null, portada_ruta text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  receipt public.ezra_publicaciones%rowtype;
  payload jsonb := jsonb_build_object('datos', datos, 'fuente_url', fuente_url,
    'fecha_fin', fecha_fin, 'portada_ruta', portada_ruta);
  proposal jsonb;
  p public.event_proposals%rowtype;
  published_event_id uuid;
  finish date;
  host text;
  cover text;
begin
  if not public.ezra_puede_publicar() then
    raise exception 'La cuenta no tiene permiso de publicación directa.' using errcode = '42501';
  end if;
  if clave is null or clave !~ '^ezra-publicar-[a-f0-9-]{36}-[a-f0-9]{64}$' then
    raise exception 'Falta la huella de la versión autorizada.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ezra:' || auth.uid()::text, 0));
  select * into receipt from public.ezra_publicaciones r where r.user_id = auth.uid() and r.clave = ezra_publicar_evento.clave;
  if found then
    if receipt.contenido <> payload then
      raise exception 'La clave ya corresponde a otro contenido.' using errcode = '22023';
    end if;
    return jsonb_build_object('id', receipt.propuesta_id, 'evento', receipt.evento_id,
      'estado', case when exists (select 1 from public.events e where e.id = receipt.evento_id and e.is_verified)
        then 'approved' else 'hidden' end);
  end if;
  if fecha_fin is not null then
    if fecha_fin !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Fecha de cierre no válida.' using errcode = '22023';
    end if;
    finish := fecha_fin::date;
    if finish < (datos->>'fecha')::date then
      raise exception 'La fecha final precede al inicio.' using errcode = '22023';
    end if;
  end if;
  if portada_ruta is not null then
    if portada_ruta !~ ('^ezra/' || auth.uid()::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'eventos' and o.name = portada_ruta) then
      raise exception 'La portada no existe en la carpeta de esta cuenta.' using errcode = '22023';
    end if;
    select substring(worker_url from '^https://([a-z0-9.-]+)/') into host from public.analyzer_settings;
    if host is null then raise exception 'Falta el dominio de almacenamiento del proyecto.' using errcode = '22023'; end if;
    cover := 'https://' || host || '/storage/v1/object/public/eventos/' || portada_ruta;
  end if;
  proposal := public.ezra_proponer_evento(datos, fuente_url, clave);
  select * into strict p from public.event_proposals where id = (proposal->>'id')::uuid for update;
  if p.status <> 'pending' or p.event_id is not null then
    raise exception 'La propuesta ya fue decidida; no se publica de nuevo.' using errcode = '22023';
  end if;
  perform set_config('spotmi.ezra_publicacion', p.id::text, true);
  insert into public.events (title, date, end_date, department, municipality, venue, category,
    description, cover_image_url, source, source_url, source_id, is_verified)
  values (p.data->>'titulo', (p.data->>'fecha')::timestamptz,
    case when finish is not null then (finish::text || 'T23:59:59-06:00')::timestamptz end,
    p.data->>'departamento', p.data->>'municipio', p.data->>'lugar', p.data->>'categoria',
    p.data->>'descripcion', cover, 'official', p.source_url, 'ezra:' || p.id, true)
  returning id into published_event_id;
  perform set_config('spotmi.ezra_publicacion', '', true);
  if not exists (select 1 from public.events e where e.id = published_event_id and e.is_verified and e.source = 'official') then
    raise exception 'Spotmi bloqueó la publicación del evento.' using errcode = '42501';
  end if;
  update public.event_proposals set status = 'approved', event_id = published_event_id,
    decided_by = auth.uid(), decided_at = now() where id = p.id;
  insert into public.ezra_publicaciones(user_id, clave, contenido, propuesta_id, evento_id)
    values (auth.uid(), clave, payload, p.id, published_event_id);
  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, changes)
    values (auth.uid(), 'ezra_evento_publicado', 'evento', published_event_id::text,
      jsonb_build_object('propuesta', p.id, 'huella', clave));
  return jsonb_build_object('id', p.id, 'estado', 'approved', 'evento', published_event_id);
end;
$$;
revoke all on function public.ezra_publicar_evento(jsonb, text, text, text, text) from public, anon;
grant execute on function public.ezra_publicar_evento(jsonb, text, text, text, text) to authenticated;

-- ═══ 5 · NUEVO: poner portada a un evento publicado que no tiene imagen ═══
-- Sólo eventos verificados y SIN portada: nunca reemplaza una imagen existente.
-- Sólo cambia cover_image_url; título, fecha, verificación y origen quedan igual.
create function public.ezra_actualizar_portada(evento uuid, portada_ruta text, clave text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  receipt public.ezra_portadas%rowtype;
  fila public.events%rowtype;
  host text;
  cover text;
begin
  if not public.ezra_puede_publicar() then
    raise exception 'La cuenta no tiene permiso de publicación directa.' using errcode = '42501';
  end if;
  if clave is null or clave !~ '^ezra-portada-[a-f0-9-]{36}-[a-f0-9]{64}$' then
    raise exception 'Falta la huella de la portada autorizada.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ezra:' || auth.uid()::text, 0));
  select * into receipt from public.ezra_portadas r where r.user_id = auth.uid() and r.clave = ezra_actualizar_portada.clave;
  if found then
    if receipt.evento_id <> evento or receipt.portada_ruta <> portada_ruta then
      raise exception 'La clave ya corresponde a otra portada.' using errcode = '22023';
    end if;
    return jsonb_build_object('evento', receipt.evento_id, 'portada', receipt.portada_url, 'estado', 'aplicada');
  end if;
  if portada_ruta is null or portada_ruta !~ ('^ezra/' || auth.uid()::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'eventos' and o.name = portada_ruta) then
    raise exception 'La portada no existe en la carpeta de esta cuenta.' using errcode = '22023';
  end if;
  select * into fila from public.events e where e.id = evento for update;
  if not found or not fila.is_verified then
    raise exception 'El evento no existe o no está publicado.' using errcode = 'P0002';
  end if;
  if coalesce(btrim(fila.cover_image_url), '') <> '' then
    raise exception 'El evento ya tiene portada; Ezra no reemplaza imágenes.' using errcode = '22023';
  end if;
  select substring(worker_url from '^https://([a-z0-9.-]+)/') into host from public.analyzer_settings;
  if host is null then raise exception 'Falta el dominio de almacenamiento del proyecto.' using errcode = '22023'; end if;
  cover := 'https://' || host || '/storage/v1/object/public/eventos/' || portada_ruta;
  perform set_config('spotmi.ezra_portada', evento::text, true);
  update public.events set cover_image_url = cover where id = evento;
  perform set_config('spotmi.ezra_portada', '', true);
  if not exists (select 1 from public.events e where e.id = evento and e.cover_image_url = cover and e.is_verified) then
    raise exception 'Spotmi bloqueó el cambio de portada.' using errcode = '42501';
  end if;
  insert into public.ezra_portadas(user_id, clave, evento_id, portada_ruta, portada_url)
    values (auth.uid(), clave, evento, portada_ruta, cover);
  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, changes)
    values (auth.uid(), 'ezra_portada_agregada', 'evento', evento::text,
      jsonb_build_object('portada', cover, 'huella', clave));
  return jsonb_build_object('evento', evento, 'portada', cover, 'estado', 'aplicada');
end;
$$;
revoke all on function public.ezra_actualizar_portada(uuid, text, text) from public, anon;
grant execute on function public.ezra_actualizar_portada(uuid, text, text) to authenticated;

-- ═══ 6 · Comprobaciones: nadie recibe acceso por instalar ═══
do $$
begin
  if has_function_privilege('anon', 'public.ezra_publicar_evento(jsonb,text,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.ezra_actualizar_portada(uuid,text,text)', 'EXECUTE') then
    raise exception 'Una cuenta anónima recibió acceso a funciones de Ezra.';
  end if;
  if has_table_privilege('authenticated', 'public.ezra_publicaciones', 'SELECT')
    or has_table_privilege('authenticated', 'public.ezra_portadas', 'SELECT')
    or has_table_privilege('authenticated', 'public.ezra_publicaciones', 'INSERT') then
    raise exception 'Los recibos privados quedaron accesibles directamente.';
  end if;
  if exists (select 1 from public.ezra_clientes_editoriales) then
    raise exception 'La instalación no debe crear cuentas editoriales.';
  end if;
end;
$$;
