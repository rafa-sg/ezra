import process from 'node:process';
import console from 'node:console';
const { PGlite } = await import(process.env.EZRA_SQL_ENGINE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage; create schema supabase_migrations;
create function auth.uid() returns uuid language sql stable as $$ select current_setting('request.jwt.claim.sub',true)::uuid $$;
create table public.events (id uuid primary key default gen_random_uuid(),title text,date timestamptz,end_date timestamptz,department text,municipality text,venue text,category text,description text,cover_image_url text,source text,source_url text,source_id text,is_verified boolean);
create table public.event_proposals(id uuid primary key default gen_random_uuid(), data jsonb,source_url text,status text,event_id uuid,editorial_user_id uuid,idempotency_key text unique,decided_by uuid,decided_at timestamptz);
create table public.ezra_publicaciones(user_id uuid,clave text,contenido jsonb,propuesta_id uuid,evento_id uuid,primary key(user_id,clave));
create table public.admin_audit_logs(actor_id uuid,action text,entity_type text,entity_id text,changes jsonb);
create table public.analyzer_settings(worker_url text);
create table storage.objects(bucket_id text,name text);
create table supabase_migrations.schema_migrations(version text primary key,name text);
create function public.ezra_puede_publicar() returns boolean language sql stable as $$ select auth.uid()='10000000-0000-4000-8000-000000000001'::uuid $$;
create function public.ezra_proponer_evento(datos jsonb,fuente_url text,clave text) returns jsonb language plpgsql as $$
declare proposal uuid;
begin
insert into public.event_proposals(data,source_url,status,editorial_user_id,idempotency_key)
values(datos,fuente_url,'pending',auth.uid(),auth.uid()::text||':'||clave) returning id into proposal;
return jsonb_build_object('id',proposal,'estado','pending');
end; $$;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
`);
const original = await readFile('docs/supabase/20261125_ezra_publicacion_directa.sql','utf8');
const originalFn=original.slice(original.indexOf('create function public.ezra_publicar_evento('),original.indexOf('\nrevoke all on function public.ezra_publicar_evento'));
await db.exec(originalFn);
const key='ezra-publicar-10000000-0000-4000-8000-000000000002-'+'a'.repeat(64);
const content={titulo:'Evento de regresión SQL',fecha:'2026-11-29T06:00:00-06:00',lugar:'Lugar de prueba',categoria:'deporte',descripcion:'Sólo motor local'};
const publish=(body=content)=>db.query('select public.ezra_publicar_evento($1::jsonb,$2,$3) as receipt',[JSON.stringify(body),'https://example.test/evento',key]);
await assert.rejects(publish(),e=>e.code==='42P01'&&e.message.includes('ezra_publicar_evento'));
assert.equal((await db.query('select count(*)::int as n from public.events')).rows[0].n,0);
await db.exec(await readFile('docs/supabase/202611250001_ezra_publicacion_recibo_fix.sql','utf8'));
const first=(await publish()).rows[0].receipt;
assert.equal(first.estado,'approved'); assert.ok(first.evento);
assert.deepEqual((await publish()).rows[0].receipt,first);
await assert.rejects(publish({...content,titulo:'Contenido distinto'}),e=>e.code==='22023');
await db.query('update public.events set is_verified=false where id=$1',[first.evento]);
assert.equal((await publish()).rows[0].receipt.estado,'hidden');
await db.exec("set request.jwt.claim.sub='10000000-0000-4000-8000-000000000009'");
await assert.rejects(publish(),e=>e.code==='42501');
assert.equal((await db.query('select count(*)::int as n from public.events')).rows[0].n,1);
assert.equal((await db.query('select count(*)::int as n from public.ezra_publicaciones')).rows[0].n,1);
console.log('PostgreSQL local: error 42P01 reproducido; corrección publica y guarda recibo, reintento sin duplicados, cambio de contenido rechazado, ocultación respetada y cuenta no autorizada bloqueada.');
await db.close();
