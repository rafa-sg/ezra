-- SPOTMI-WEB PRODUCCIÓN: nwcmrcgfhdufnaomzkmz
-- INSTALACIÓN PERMANENTE de 20261103 + 20261117 + 20261125.
-- Ejecutar sólo después de PRUEBA CORRECTA en probar_instalacion_ezra.sql.
-- Copiar TODO, reemplazar la consulta anterior y ejecutar sin seleccionar fragmentos.
-- Crea la integración y registra sus versiones. No crea usuarios ni publica eventos.
-- Ninguna cuenta editorial queda habilitada; puede_publicar empieza en false.
-- Es una transacción: si falla una instrucción anterior a COMMIT, no se instala.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations
    where version in ('20261103', '20261117', '20261125', '202611250001')) then
    raise exception 'Ya hay una versión registrada; revisar antes de volver a instalar.';
  end if;
end;
$$;
do $$
begin
  if to_regclass('public.events') is null or to_regclass('public.event_proposals') is null then
    raise exception 'Faltan las tablas base de Spotmi; se canceló el ensayo.';
  end if;
  if to_regclass('public.ezra_clientes_editoriales') is not null
    or to_regclass('public.ezra_publicaciones') is not null then
    raise exception 'La integración ya cambió desde el diagnóstico; revisar antes de continuar.';
  end if;
end;
$$;
-- ═══ 20261103_propuestas_ezra.sql ═══
-- Protege la bandeja de propuestas frente a un cliente editorial de Ezra:
-- sólo un founder concede/revoca acceso, sólo se insertan propuestas pendientes,
-- el cliente no decide ni escribe las tablas directamente, y la repetición de
-- una petición no duplica contenido. No crea ni publica filas en events.
-- Campos: los mismos que `admin_decidir_propuesta` copia al evento al aprobar
-- (título, fecha con hora opcional, lugar, municipio, departamento, categoría y
-- descripción). Precio y boletos no tienen columna en ese flujo: Ezra los manda
-- como líneas de la descripción.
-- PREPARADA SIN APLICAR por instrucción del propietario. Ataques: supabase/tests/propuestas_ezra.sql.

create table public.ezra_clientes_editoriales (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  activo boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ezra_clientes_editoriales enable row level security;
revoke all on public.ezra_clientes_editoriales from public, anon, authenticated;
grant select on public.ezra_clientes_editoriales to authenticated;
create policy ezra_clientes_lectura_fundador on public.ezra_clientes_editoriales
  for select to authenticated using ((select public.es_fundador()));

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
-- No se añade una política de escritura ni se amplían las de lectura existentes.
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

-- La cuenta editorial usa Supabase Auth. Darla de alta no la convierte en admin de Spotmi.
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
    'activo', public.es_cliente_editorial_ezra());
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
  -- Sin hora confirmada, el evento queda a las 00:00 como los del analizador.
  if nullif(btrim(datos->>'hora'), '') is not null and (datos->>'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Indica la hora en formato HH:MM (24 horas).' using errcode = '22023';
  end if;
  -- Las mismas categorías que acepta el analizador.
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
  -- La clave se separa por cuenta: adivinar la de otra cuenta no permite leer su propuesta.
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

-- ═══ 20261117_eventos_conteo_solo_equipo.sql ═══
-- Protege contra: que quien propone un evento por PostgREST le ponga un
-- conteo de verificaciones falso.
--
-- Hallazgo revisado con Ezra (handoff `informe-spotmi-web-is_verified.md`):
-- `is_verified` y `source` ya los cierran 20261002, 20261003 y 20261021 con
-- el trigger `proteger_verificacion_evento()`. Lo único que quedaba abierto
-- era `verification_count`: el autor podía insertar su evento con 99
-- verificaciones o subirlas en un PATCH. No lo publica (eso sigue siendo
-- `is_verified`), pero el moderador ve ese número en la bandeja de
-- Propuestas (`'verificaciones'`) y lo usa como señal de confianza.
--
-- Se conserva la función de 20261021 tal cual y sólo se añade el conteo:
--   - por la API, al insertar nace en 0 y al editar se queda como estaba;
--   - el conteo real lo escribe el trigger de `event_verifications`
--     (`handle_event_verification`, de la app): corre con
--     `pg_trigger_depth() > 1` y no pasa por aquí;
--   - el panel (`admin_guardar_contenido`, `admin_decidir_propuesta`), el rol
--     de servicio y el SQL Editor siguen igual.
--
-- No se usa «si auth.role() <> 'service_role', forzar»: el panel aprueba con
-- `auth.role() = 'authenticated'` dentro de funciones `security definer`, y
-- forzar ahí dejaría a moderación sin poder publicar nada. Tampoco se cambia
-- la regla de que un evento aprobado vuelve a revisión si su autor lo edita.
--
-- Ataque: `supabase/tests/eventos_conteo_solo_equipo.sql`.

create or replace function public.proteger_verificacion_evento()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  -- Dentro de una función del admin (`security definer`), no por la API.
  desde_el_panel boolean := current_user not in ('authenticated', 'anon');
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Crear el evento de una propuesta del analizador (`admin_decidir_propuesta`).
  if tg_op = 'INSERT'
     and desde_el_panel
     and current_setting('spotmi.evento_por_admin', true) = 'on'
     and public.puede_editar_contenido() then
    return new;
  end if;

  -- Publicar, esconder o corregir desde Contenido o Propuestas. El origen no
  -- lo cambia nadie por aquí.
  if tg_op = 'UPDATE' and desde_el_panel and public.puede_editar_contenido() then
    new.source := old.source;
    new.source_id := old.source_id;
    new.source_url := old.source_url;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.verification_count := 0;
    new.source := 'community';
    new.source_id := null;
    new.source_url := null;
  else
    if new.is_verified and not old.is_verified then
      raise exception 'solo el equipo verifica eventos' using errcode = '42501';
    elsif old.is_verified then
      new.is_verified := false;
    end if;
    new.verification_count := old.verification_count;
    new.source := old.source;
    new.source_id := old.source_id;
    new.source_url := old.source_url;
  end if;
  return new;
end;
$$;

comment on function public.proteger_verificacion_evento() is
  'Sólo el equipo verifica eventos y decide su origen y su conteo: por PostgREST no se aprueban, no se marcan como oficiales y no se inventan verificaciones.';

revoke all on function public.proteger_verificacion_evento() from public, anon, authenticated;

-- PUBLICACIÓN DIRECTA 20261125

alter table public.ezra_clientes_editoriales
  add column puede_publicar boolean not null default false;

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

create or replace function public.ezra_identidad_editorial()
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

-- Recibo privado, inmutable y por cuenta. No abre lectura/escritura de events.
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

-- Sólo archivos nuevos e inmutables bajo la carpeta de la propia cuenta.
create policy eventos_subir_ezra on storage.objects for insert to authenticated
with check (
  bucket_id = 'eventos' and (select public.ezra_puede_publicar())
  and name ~ ('^ezra/' || auth.uid()::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
);

-- Se conserva el endurecimiento 20261117; la única excepción nueva es INSERT
-- desde la RPC propietaria con propuesta de ESTA cuenta y marca de transacción.
create or replace function public.proteger_verificacion_evento()
returns trigger language plpgsql set search_path = public, pg_catalog
as $$
declare
  desde_el_panel boolean := current_user not in ('authenticated', 'anon');
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
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
  if tg_op = 'INSERT' and desde_el_panel
     and current_setting('spotmi.evento_por_admin', true) = 'on'
     and public.puede_editar_contenido() then return new; end if;
  if tg_op = 'UPDATE' and desde_el_panel and public.puede_editar_contenido() then
    new.source := old.source; new.source_id := old.source_id; new.source_url := old.source_url;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false; new.verification_count := 0;
    new.source := 'community'; new.source_id := null; new.source_url := null;
  else
    if new.is_verified and not old.is_verified then
      raise exception 'solo el equipo verifica eventos' using errcode = '42501';
    elsif old.is_verified then new.is_verified := false;
    end if;
    new.verification_count := old.verification_count;
    new.source := old.source; new.source_id := old.source_id; new.source_url := old.source_url;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_verificacion_evento() from public, anon, authenticated;

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
  event_id uuid;
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
    -- Nunca vuelve a publicar lo que el equipo ocultó posteriormente.
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
  -- Reutiliza la validación de campos, origen, fecha, categorías y cuota diaria.
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
  returning id into event_id;
  perform set_config('spotmi.ezra_publicacion', '', true);
  if not exists (select 1 from public.events e where e.id = event_id and e.is_verified and e.source = 'official') then
    raise exception 'Spotmi bloqueó la publicación del evento.' using errcode = '42501';
  end if;
  update public.event_proposals set status = 'approved', event_id = ezra_publicar_evento.event_id,
    decided_by = auth.uid(), decided_at = now() where id = p.id;
  insert into public.ezra_publicaciones(user_id, clave, contenido, propuesta_id, evento_id)
    values (auth.uid(), clave, payload, p.id, event_id);
  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, changes)
    values (auth.uid(), 'ezra_evento_publicado', 'evento', event_id::text,
      jsonb_build_object('propuesta', p.id, 'huella', clave));
  return jsonb_build_object('id', p.id, 'estado', 'approved', 'evento', event_id);
end;
$$;
revoke all on function public.ezra_publicar_evento(jsonb, text, text, text, text) from public, anon;
grant execute on function public.ezra_publicar_evento(jsonb, text, text, text, text) to authenticated;
-- Verificaciones estructurales: ninguna cuenta recibe acceso por instalar.
do $$
begin
  if to_regprocedure('public.ezra_publicar_evento(jsonb,text,text,text,text)') is null then
    raise exception 'Falta la función de publicación directa.';
  end if;
  if to_regprocedure('public.ezra_proponer_evento(jsonb,text,text)') is null
    or to_regprocedure('public.ezra_identidad_editorial()') is null then
    raise exception 'Faltan funciones editoriales previas.';
  end if;
  if has_function_privilege('anon', 'public.ezra_publicar_evento(jsonb,text,text,text,text)', 'EXECUTE') then
    raise exception 'Una cuenta anónima recibió acceso a la función.';
  end if;
  if not has_function_privilege('authenticated', 'public.ezra_publicar_evento(jsonb,text,text,text,text)', 'EXECUTE') then
    raise exception 'Falta el permiso de llamada autenticada.';
  end if;
  if has_table_privilege('authenticated', 'public.ezra_publicaciones', 'SELECT')
    or has_table_privilege('authenticated', 'public.ezra_publicaciones', 'INSERT') then
    raise exception 'Los recibos privados quedaron accesibles directamente.';
  end if;
  if exists (select 1 from public.ezra_clientes_editoriales)
    or exists (select 1 from public.ezra_publicaciones) then
    raise exception 'El ensayo no debe crear cuentas editoriales ni publicaciones.';
  end if;
end;
$$;
-- Corrección del recibo (202611250001)
create or replace function public.ezra_publicar_evento(
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
    -- Nunca vuelve a publicar lo que el equipo ocultó posteriormente.
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
  -- Reutiliza la validación de campos, origen, fecha, categorías y cuota diaria.
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
-- Historial coherente con lo instalado dentro de esta misma transacción.
insert into supabase_migrations.schema_migrations(version, name)
values
  ('20261103', 'propuestas_ezra'),
  ('20261117', 'eventos_conteo_solo_equipo'),
  ('20261125', 'ezra_publicacion_directa'),
  ('202611250001', 'ezra_publicacion_recibo_fix');
commit;

select
  'INTEGRACIÓN INSTALADA: falta configurar la cuenta editorial' as resultado,
  to_regclass('public.ezra_clientes_editoriales') is not null as editorial_instalada,
  to_regclass('public.ezra_publicaciones') is not null as recibos_instalados,
  (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261103', '20261117', '20261125', '202611250001')) as migraciones_registradas,
  (select count(*) from public.ezra_clientes_editoriales where activo and puede_publicar)
    as cuentas_habilitadas;
