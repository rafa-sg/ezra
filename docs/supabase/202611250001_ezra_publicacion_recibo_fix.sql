-- Corrección de publicación directa: variable local usada en UPDATE.
-- La referencia ezra_publicar_evento.event_id causaba 42P01 y revertía el envío.
-- No cambia permisos, datos autorizados, claves de envío ni eventos existentes.
-- Ejecutar completo en el proyecto de producción confirmado.
begin;
set local lock_timeout = '5s';
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
insert into supabase_migrations.schema_migrations(version, name)
values ('202611250001', 'ezra_publicacion_recibo_fix')
on conflict (version) do nothing;
commit;
select 'CORRECCIÓN INSTALADA: reintentar el mismo evento' as resultado;
