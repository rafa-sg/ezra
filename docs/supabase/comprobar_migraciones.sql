-- Sólo lectura. Ejecutar en Spotmi-Web de producción.
select required.version as migracion,
  case when installed.version is null then 'NO REGISTRADA'
    else 'REGISTRADA' end as estado
from (values ('20261103'), ('20261117'), ('20261125')) as required(version)
left join supabase_migrations.schema_migrations as installed
  on installed.version = required.version
order by required.version;
