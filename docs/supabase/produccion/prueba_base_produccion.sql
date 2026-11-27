-- Copia mínima del esquema de producción (27 nov 2026) para pruebas locales. Sin datos reales.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;
create schema auth; create schema storage; create schema supabase_migrations; create extension if not exists pgcrypto;
grant usage on schema public, auth, storage to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on all functions in schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create table storage.buckets (id text primary key, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create table supabase_migrations.schema_migrations (version text primary key, name text);

create table public.admin_members (user_id uuid primary key, role text, status text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.admin_audit_logs (id bigserial primary key, actor_id uuid, action text not null, entity_type text not null, entity_id text, changes jsonb not null default '{}', created_at timestamptz not null default now());
create table public.analyzer_settings (id boolean primary key default true, worker_url text);
insert into public.analyzer_settings(worker_url) values ('https://bvmzrmvrdbfpkdhwazgv.supabase.co/functions/v1/analizador');
create table public.analyzer_runs (id uuid primary key default gen_random_uuid());
create table public.event_sources (id uuid primary key default gen_random_uuid());
create table public.services (id uuid primary key default gen_random_uuid(), owner_id uuid);
create table public.profiles (id uuid primary key, points int default 0);

create table public.events (
  id uuid primary key default gen_random_uuid(), title text, date timestamptz, end_date timestamptz,
  category text, contact text, cover_image_url text, created_by uuid, department text, description text,
  is_verified boolean default false, lat double precision, lng double precision, municipality text,
  organizer text, price_from numeric, service_id uuid, source text default 'official', source_id text,
  source_url text, ticket_note text, ticket_status text, time_of_day text, venue text,
  verification_count integer default 0, website text);
create unique index events_source_id_key on public.events(source_id) where source_id is not null;
create unique index events_title_date_key on public.events(title, date);
alter table public.events enable row level security;
grant all on public.events to anon, authenticated;

create table public.event_proposals (
  id uuid primary key default gen_random_uuid(), origin text, status text default 'pending', data jsonb default '{}',
  event_id uuid references public.events(id) on delete cascade, duplicate_of uuid references public.events(id) on delete set null,
  source_id uuid references public.event_sources(id), run_id uuid references public.analyzer_runs(id),
  source_url text, evidence text, reason text, decided_at timestamptz, decided_by uuid, created_at timestamptz default now(),
  constraint event_proposals_origin_check check (origin = any (array['community','analyzer'])),
  constraint event_proposals_status_check check (status = any (array['pending','approved','discarded','duplicate'])),
  constraint event_proposals_data_check check (jsonb_typeof(data) = 'object'),
  constraint event_proposals_duplicado_con_evento check (status <> 'duplicate' or duplicate_of is not null));
create unique index event_proposals_evento on public.event_proposals(event_id) where event_id is not null;
alter table public.event_proposals enable row level security;
grant select on public.event_proposals to anon, authenticated;

create table public.event_verifications (id uuid primary key default gen_random_uuid(), event_id uuid not null, user_id uuid not null, created_at timestamptz default now());
alter table public.event_verifications enable row level security;
grant all on public.event_verifications to anon, authenticated;

create function public.es_fundador() returns boolean language sql stable security definer set search_path to 'public','pg_catalog' as $$
  select exists (select 1 from public.admin_members where user_id = (select auth.uid()) and status = 'active' and role = 'founder'); $$;
create function public.puede_editar_contenido() returns boolean language sql stable security definer set search_path to 'public','pg_catalog' as $$
  select exists (select 1 from public.admin_members where user_id = (select auth.uid()) and status = 'active' and role in ('founder','admin','content_manager')); $$;
create function public.es_admin() returns boolean language sql stable security definer set search_path to 'public','pg_catalog' as $$
  select exists (select 1 from public.admin_members where user_id = (select auth.uid()) and status = 'active'); $$;

-- Políticas de producción
create policy "eventos verificados son publicos" on public.events for select to public using ((is_verified = true) or (created_by = (select auth.uid())));
create policy events_delete_own on public.events for delete to authenticated using (created_by = auth.uid());
create policy events_insert_community on public.events for insert to authenticated with check ((source = 'community') and ((select auth.uid()) = created_by));
create policy events_update_own on public.events for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy event_proposals_leer on public.event_proposals for select to authenticated using ((select public.es_admin()));
create policy event_verifications_insert_own on public.event_verifications for insert to authenticated with check (((select auth.uid()) = user_id) and not exists (select 1 from public.events e where e.id = event_verifications.event_id and e.created_by = (select auth.uid())));
create policy event_verifications_select_all on public.event_verifications for select to public using (true);
create policy eventos_leer on storage.objects for select to public using (bucket_id = 'eventos');
create policy eventos_subir_analizador on storage.objects for insert to authenticated with check ((bucket_id = 'eventos') and ((storage.foldername(name))[1] = 'analizador') and (select public.puede_editar_contenido()));

-- Triggers de producción (cuerpos copiados tal cual)
create function public.evento_de_ficha_propia() returns trigger language plpgsql security definer set search_path to 'public','pg_catalog' as $function$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then return new; end if;
  if new.service_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then return new; end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.owner_id = auth.uid()) then
    raise exception 'Sólo puedes ligar un evento a tu propio negocio.' using errcode = '42501';
  end if;
  return new;
end; $function$;
create function public.sincronizar_propuesta_evento() returns trigger language plpgsql security definer set search_path to 'public','pg_catalog' as $function$
begin
  if tg_op = 'INSERT' then
    if new.source = 'community' and not new.is_verified then
      insert into public.event_proposals (origin, event_id) values ('community', new.id)
      on conflict (event_id) where event_id is not null do nothing;
    end if;
    return new;
  end if;
  if new.is_verified and not old.is_verified then
    update public.event_proposals set status = 'approved', decided_at = now(),
      decided_by = case when public.puede_editar_contenido() then auth.uid() end
    where event_id = new.id and status = 'pending';
  end if;
  return new;
end; $function$;
create function public.respetar_descarte_de_propuesta() returns trigger language plpgsql security definer set search_path to 'public','pg_catalog' as $function$
begin
  if new.is_verified and not old.is_verified and not public.puede_editar_contenido()
     and exists (select 1 from public.event_proposals where event_id = new.id and status in ('discarded', 'duplicate')) then
    new.is_verified := false;
  end if;
  return new;
end; $function$;
create function public.proteger_verificacion_evento() returns trigger language plpgsql set search_path to 'public','pg_catalog' as $function$
declare
  desde_el_panel boolean := current_user not in ('authenticated', 'anon');
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' and desde_el_panel and current_setting('spotmi.evento_por_admin', true) = 'on' and public.puede_editar_contenido() then return new; end if;
  if tg_op = 'UPDATE' and desde_el_panel and public.puede_editar_contenido() then
    new.source := old.source; new.source_id := old.source_id; new.source_url := old.source_url; return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false; new.source := 'community'; new.source_id := null; new.source_url := null;
  else
    if new.is_verified and not old.is_verified then
      raise exception 'solo el equipo verifica eventos' using errcode = '42501';
    elsif old.is_verified then new.is_verified := false;
    end if;
    new.source := old.source; new.source_id := old.source_id; new.source_url := old.source_url;
  end if;
  return new;
end; $function$;
create function public.handle_new_event() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.source = 'community' and new.created_by is not null then
    update public.profiles set points = points + 40 where id = new.created_by;
  end if;
  return new;
end; $function$;
create function public.handle_event_verification() returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_count int;
begin
  select count(*) into v_count from public.event_verifications where event_id = new.event_id;
  update public.events set verification_count = v_count, is_verified = (v_count >= 3) where id = new.event_id;
  return new;
end; $function$;
create trigger eventos_ficha_propia before insert or update on public.events for each row execute function public.evento_de_ficha_propia();
create trigger eventos_propuesta after insert or update on public.events for each row execute function public.sincronizar_propuesta_evento();
create trigger eventos_respetar_descarte before update on public.events for each row execute function public.respetar_descarte_de_propuesta();
create trigger eventos_verificacion_solo_equipo before insert or update on public.events for each row execute function public.proteger_verificacion_evento();
create trigger on_new_event after insert on public.events for each row execute function public.handle_new_event();
create trigger on_event_verification after insert on public.event_verifications for each row execute function public.handle_event_verification();

-- Funciones del panel (simplificadas) para comprobar que el equipo sigue igual.
create function public.admin_crear_evento(t text, d timestamptz) returns uuid language plpgsql security definer set search_path to 'public','pg_catalog' as $$
declare i uuid;
begin
  if not public.puede_editar_contenido() then raise exception 'no' using errcode='42501'; end if;
  perform set_config('spotmi.evento_por_admin', 'on', true);
  insert into public.events(title, date, source, is_verified) values (t, d, 'official', true) returning id into i;
  perform set_config('spotmi.evento_por_admin', '', true);
  return i;
end; $$;
create function public.admin_ocultar_evento(e uuid) returns void language plpgsql security definer set search_path to 'public','pg_catalog' as $$
begin
  if not public.puede_editar_contenido() then raise exception 'no' using errcode='42501'; end if;
  update public.events set is_verified = false where id = e;
end; $$;
grant execute on function public.admin_crear_evento(text, timestamptz), public.admin_ocultar_evento(uuid) to authenticated;
