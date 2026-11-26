-- Web pública spotmi.com.sv: bvmzrmvrdbfpkdhwazgv (producción).
-- Spotmi-Web nwcmrcgfhdufnaomzkmz es desarrollo; no confundir con producción.
-- Sólo lectura: no modifica datos, funciones, permisos ni usuarios.
select 'tabla' as tipo, name as nombre,
  case when to_regclass('public.' || name) is not null
    then 'EXISTE' else 'FALTA' end as estado
from unnest(array[
  'events', 'event_proposals', 'ezra_clientes_editoriales',
  'ezra_publicaciones', 'admin_members', 'analyzer_settings'
]) as name
union all
select 'funcion', name,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = name
  ) then 'EXISTE' else 'FALTA' end
from unnest(array[
  'ezra_identidad_editorial', 'ezra_proponer_evento',
  'ezra_estado_propuesta', 'ezra_publicar_evento',
  'proteger_verificacion_evento'
]) as name
order by tipo, nombre;
