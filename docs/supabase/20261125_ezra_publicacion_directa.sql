-- Preparada para Spotmi. Requiere 20261103 y 20261117. NO aplicar con db push
-- indiscriminado: hay migraciones ajenas pendientes. Cuenta editorial sin rol admin.
begin;

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
commit;

-- Habilitación posterior, sólo por el administrador en SQL Editor (UUID real):
-- update public.ezra_clientes_editoriales set puede_publicar = true
-- where user_id = '<UUID_DE_LA_CUENTA_EDITORIAL>' and activo;
-- No se concede rol de fundador ni se utiliza service_role en Ezra.
