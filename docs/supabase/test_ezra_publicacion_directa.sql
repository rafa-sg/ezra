-- Ejecutar SÓLO en una base de desarrollo con la migración 20261125 aplicada.
-- Requiere un fundador y dos cuentas confirmadas, sin rol admin ni cliente Ezra.
-- Todas las escrituras se revierten. No crea usuarios ni envía correos.
begin;
do $$
declare
  founder uuid;
  users uuid[];
  editor uuid;
  intruder uuid;
  body jsonb;
  receipt jsonb;
  retry jsonb;
  key text := 'ezra-publicar-10000000-0000-4000-8000-000000000001-' || repeat('a', 64);
  before_count bigint;
begin
  select user_id into founder from public.admin_members where role = 'founder' and status = 'active' limit 1;
  select array_agg(id) into users from (
    select id from auth.users where email_confirmed_at is not null
      and id not in (select user_id from public.admin_members)
      and id not in (select user_id from public.ezra_clientes_editoriales)
    order by created_at limit 2
  ) candidates;
  if founder is null or coalesce(array_length(users, 1), 0) < 2 then
    raise exception 'Faltan cuentas de prueba en desarrollo; no se modificó nada.';
  end if;
  editor := users[1]; intruder := users[2];
  body := jsonb_build_object('titulo', 'Prueba de publicación con rollback',
    'fecha', ((now() at time zone 'America/El_Salvador')::date + 7)::text,
    'hora', '19:30', 'lugar', 'Lugar de prueba', 'categoria', 'musica', 'departamento', 'San Salvador');
  insert into public.ezra_clientes_editoriales(user_id, nombre, created_by)
    values (editor, 'Prueba editorial', founder);
  select count(*) into before_count from public.events;

  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.ezra_publicar_evento(body, 'https://example.test/evento', key);
    raise exception 'FALLO: anónimo pudo publicar';
  exception when insufficient_privilege then null;
  end;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', intruder, 'role', 'authenticated')::text, true);
  begin
    perform public.ezra_publicar_evento(body, 'https://example.test/evento', key);
    raise exception 'FALLO: cuenta ajena pudo publicar';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor, 'role', 'authenticated')::text, true);
  begin
    perform public.ezra_publicar_evento(body, 'https://example.test/evento', key);
    raise exception 'FALLO: proponer permitía publicar';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ezra_clientes_editoriales set puede_publicar = true where user_id = editor;
    raise exception 'FALLO: editorial se concedió permiso';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update public.ezra_clientes_editoriales set puede_publicar = true where user_id = editor;
  set local role authenticated;
  if not public.ezra_puede_publicar() then raise exception 'FALLO: permiso no reconocido'; end if;
  begin
    perform public.ezra_publicar_evento(body || '{"is_verified":true}'::jsonb, 'https://example.test/evento', key);
    raise exception 'FALLO: se aceptaron campos arbitrarios';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ezra_publicar_evento(body, 'https://example.test/evento', key, null,
      'ezra/' || intruder::text || '/' || repeat('a',64) || '.png');
    raise exception 'FALLO: portada de otra cuenta aceptada';
  exception when invalid_parameter_value then null;
  end;
  receipt := public.ezra_publicar_evento(body, 'https://example.test/evento', key,
    ((now() at time zone 'America/El_Salvador')::date + 8)::text);
  retry := public.ezra_publicar_evento(body, 'https://example.test/evento', key,
    ((now() at time zone 'America/El_Salvador')::date + 8)::text);
  if receipt <> retry or receipt->>'estado' <> 'approved' then raise exception 'FALLO: recibo o reintento'; end if;
  begin
    perform public.ezra_publicar_evento(body || '{"titulo":"Otro contenido"}'::jsonb,
      'https://example.test/evento', key, ((now() at time zone 'America/El_Salvador')::date + 8)::text);
    raise exception 'FALLO: misma clave cambió contenido';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', intruder, 'role', 'authenticated')::text, true);
  begin
    perform public.ezra_estado_propuesta((receipt->>'id')::uuid);
    raise exception 'FALLO: otra cuenta leyó el recibo';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select count(*) from public.events) <> before_count + 1 then raise exception 'FALLO: duplicación'; end if;
  if not exists (select 1 from public.events where id = (receipt->>'evento')::uuid
    and is_verified and source = 'official' and verification_count = 0 and end_date is not null) then
    raise exception 'FALLO: evento no público, conteo inventado o cierre perdido';
  end if;
  -- Una moderación posterior sigue mandando: el reintento no lo vuelve público.
  perform set_config('request.jwt.claims', '{}', true);
  update public.events set is_verified = false where id = (receipt->>'evento')::uuid;
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor, 'role', 'authenticated')::text, true);
  retry := public.ezra_publicar_evento(body, 'https://example.test/evento', key,
    ((now() at time zone 'America/El_Salvador')::date + 8)::text);
  if retry->>'estado' <> 'hidden' then raise exception 'FALLO: reintento republicó un oculto'; end if;
  reset role;
  raise notice 'PUBLICACIÓN DIRECTA: pruebas terminadas; rollback a continuación.';
end;
$$;
rollback;
