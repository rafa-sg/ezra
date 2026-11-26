# Publicación de eventos desde Ezra

## Estado comprobado el 25 de noviembre de 2026

Se corrigió una identificación equivocada de los proyectos. Los nombres de rama
«main PRODUCTION» de Supabase no identifican por sí solos la base usada por la web.

| Destino | Proyecto Supabase | Estado |
| --- | --- | --- |
| Web pública `spotmi.com.sv` | `bvmzrmvrdbfpkdhwazgv` | Confirmado en sus archivos JavaScript desplegados y en ADMIN.md de spotmi-web |
| Desarrollo Spotmi-Web / conexión actual de Ezra | `nwcmrcgfhdufnaomzkmz` | Integración instalada, cuenta editorial verificada y Garmin enviado aquí |

La corrección [202611250001](supabase/202611250001_ezra_publicacion_recibo_fix.sql)
fue ejecutada por el propietario en `nwcmrcgfhdufnaomzkmz`. Se recuperó el envío
autorizado con la misma clave: Garmin Duatlón Series 2026, evento
`ec538aa4-e4fd-4466-973a-8bcde2444caf`, fecha 29 de noviembre de 2026, 06:00 de
El Salvador. Se comprobó exactamente una fila pública y verificada en esa base,
sin portada porque su permiso no estaba confirmado. El recibo de Ezra corresponde
a esa base, no demuestra publicación en la web de producción.

La web devuelve 200 sin Garmin y su URL de detalle devuelve 404. El problema
principal es el destino distinto; no esperar a la caché como solución.
La API de producción devuelve PGRST202 al consultar `ezra_identidad_editorial`:
no está disponible esa firma en su esquema expuesto. No se ha inspeccionado su
historial de migraciones. La sesión del panel abierta redirige al listado de la
organización al intentar abrir el proyecto de producción; no permite inspeccionarlo.

### Pendiente para conectar la web real

1. Entrar con una cuenta que tenga acceso a
   https://supabase.com/dashboard/project/bvmzrmvrdbfpkdhwazgv .
2. Ejecutar [el diagnóstico de sólo lectura](supabase/diagnostico_produccion.sql)
   y revisar las migraciones existentes antes de preparar la instalación necesaria.
   No ejecutar a ciegas el instalador conjunto ni `db push` general.
3. Preparar y validar únicamente las migraciones faltantes para ese esquema;
   habilitar una cuenta editorial dedicada, sin conceder rol administrador.
4. Configurar en privado URL, clave pública y credenciales de esa cuenta. Recrear
   y verificar la conexión: la sesión actual pertenece a desarrollo.
5. Revisar el recibo y la autorización antes de enviar Garmin al destino correcto.
   No borrar ni resetear el recibo existente para forzar un reintento. La protección
   de duplicados debe conservar la trazabilidad del proyecto de destino.
6. Verificar fila, detalle y listado de la web. El listado tiene `revalidate=3600`;
   la caché sólo se evalúa después de confirmar una inserción en la base correcta.

No se cambia la base de la web pública para hacerla coincidir con desarrollo.
No se han modificado sus datos, DNS ni despliegue. Los apuntes históricos de
TASKS.md y DECISIONS.md que llaman producción a `nwcmrcgfhdufnaomzkmz` describen
la suposición equivocada inicial, corregida por este diagnóstico.

## Vencimiento e historial

La bandeja de Ezra oculta desde el segundo día de calendario posterior a
`fechaFin ?? fecha`, usando la fecha local de El Salvador. Conserva todos los
registros. Buscar texto, filtrar fechas o activar «Mostrar eventos vencidos»
incluye el historial. Los eventos sin fecha confirmada permanecen visibles.
Este filtro no cambia la agenda pública de Spotmi.

Verificación realizada: `npm run check` (225/225), build en copia aislada y
regresión SQL con PostgreSQL embebido. Revisión visual del filtro pendiente.

## Uso

1. Completar y revisar datos, fuente y permiso de portada en Eventos.
2. Aprobar la versión. Cambiar hechos, archivo o permiso exige revisar de nuevo.
3. Elegir **Publicar en Spotmi**, revisar el resumen y escribir `PUBLICAR`.
4. Esperar la confirmación. Si la respuesta se pierde, recargar y repetir la misma
   publicación: la clave persistente y el recibo de Supabase impiden duplicados.

Sólo una cuenta con rol propietario en Ezra puede autorizar la publicación directa.
Las portadas confirmadas se copian al bucket de Spotmi; nunca se envían referencias
IA ni fotos sin permiso confirmado. Un evento sin portada se publica sin imagen.
Precio y boletos se conservan en la descripción, como en las propuestas actuales.
La fecha final se conserva hasta las 23:59:59 de ese día en El Salvador.
No hay sincronización automática de ediciones ni borrado de eventos ya enviados.

## Subdominio

`ezra.spotmi.com.sv` requiere confirmar el alojamiento y su destino DNS. La base
SQLite y los medios locales necesitan disco persistente, y los procesos de fondo
necesitan un servidor adecuado. No sustituirlo por un despliegue sin persistencia.
El subdominio no es requisito para enviar desde Ezra local a Supabase.

## Comprobación manual

Validación local: lint, TypeScript y 222 pruebas unitarias correctas; compilación
correcta en una copia aislada. Las integraciones HTTP no pudieron abrir loopback
(`listen EPERM`). La migración y sus pruebas SQL todavía no se ejecutaron en
PostgreSQL. La revisión visual con sesión real queda pendiente.

- En escritorio y móvil, abrir el resumen, recorrerlo con Tab y cerrarlo con Escape.
- Confirmar que sólo `PUBLICAR` habilita el envío; cerrar no debe publicar.
- Abrir dos ventanas, editar una versión y comprobar que la otra recibe conflicto.
- Revisar que la portada del resumen corresponde a la versión aprobada; una imagen
  sin permiso o de referencia IA debe anunciarse como excluida.
- Con un evento autorizado de prueba, comprobar ficha pública, fecha final y portada.
- Repetir el envío ante una respuesta perdida y comprobar un solo evento/recibo.

## Diagnóstico confirmado del inicio de sesión

La captura de auth.users confirma correo verificado, `tiene_contrasena=false` y
proveedor `google` en la cuenta elegida. La conexión actual de Ezra usa
`grant_type=password`: una contraseña de Gmail no funciona como contraseña de
Supabase. No seguir reintentando. Crear una cuenta técnica dedicada con correo
y contraseña desde Supabase Auth, confirmada y sin rol admin; preparar el permiso
editorial para su nuevo UUID y actualizar el entorno privado. La cuenta Google
existente conserva su acceso y el permiso ya dado hasta que se decida revocarlo.
