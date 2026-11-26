# Regresión de publicación directa

Ejecuta el cuerpo real de `ezra_publicar_evento` en PostgreSQL embebido (PGlite),
con tablas mínimas y un sustituto local de la RPC previa de propuestas. No conecta
con Supabase, no carga archivos de entorno ni usa datos de usuario.

```sh
npm install --prefix /tmp/ezra-sql-verification --cache /tmp/ezra-npm-cache --ignore-scripts --no-audit --no-fund @electric-sql/pglite
EZRA_SQL_ENGINE=/tmp/ezra-sql-verification/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/spotmi-publicacion-regression.mjs
```

La prueba reproduce el error `42P01` de la versión original al guardar el id del
evento y verifica que la sentencia fallida no dejó el evento creado. Tras aplicar
la migración correctiva comprueba publicación y recibo, reintento sin duplicado,
rechazo de otro contenido con la misma clave, respeto de una ocultación posterior
y rechazo de una identidad no autorizada.

Esta prueba del cuerpo SQL no sustituye las pruebas de las políticas, triggers,
portadas y cuentas reales del proyecto de Supabase.
