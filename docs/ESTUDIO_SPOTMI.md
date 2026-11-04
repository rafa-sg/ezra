# Estudio Spotmi en Ezra

Dirección vigente del propietario, 27 de octubre de 2026. El estudio vive en Ezra y utiliza las fichas públicas de https://spotmi.com.sv. Está disponible para administración en `/azra/produccion`.

## Usar el estudio

1. En **Equipo de agentes**, elige una especialidad. El cazador empieza con las fuentes del catálogo del equipo: MITUR, Cultura e ISTU. Es un encargo de investigación, no una declaración de hechos verificados.
2. Escribe qué quieres conseguir, conserva los enlaces y las notas de evidencia/permiso. Elige Astra, Claude o Gemini y los canales de salida.
3. Guarda y ejecuta el encargo con la IA elegida, o copia/descarga el encargo para trabajarlo en tu chat. Ejecutar requiere confirmar el envío y puede consumir cuota de la cuenta. No hay ejecución periódica de fondo.
4. La respuesta llega para revisión. También puedes pegar un resultado manual. Revisa hechos, vigencia, derechos, texto y enlaces antes de aprobar esa versión.
5. Desde una entrega aprobada puedes crear el siguiente encargo: por ejemplo, cazador → guionista → editor → redactor → auditor. Los encargos conservan la versión de su antecedente; cambiarlo invalida las aprobaciones de sus derivados.
6. Usa la fecha prevista para organizar la agenda en hora de El Salvador. Descarga el paquete para conservar el texto, las referencias y la revisión.

**Eventos y spots** consulta las fichas públicas verificadas. Un evento verificado no garantiza que su organizador sea una entidad gubernamental; revisa la fuente original. Una imagen publicada tampoco acredita por sí sola permiso de reutilización. Las imágenes generadas de los spots mantienen su etiqueta.

## Tus IA

- **Astra/Codex:** requiere `codex` instalado y una sesión de ChatGPT. El adaptador comprueba ese tipo de acceso; no usa una clave de API para este modo. Ejecuta con `gpt-6-astra`, configuración del usuario ignorada, sesión efímera, sandbox de solo lectura, sin comandos, archivos, plugins ni conexiones MCP. Solo el cazador dispone de búsqueda web pública. El resto trabaja con el material del encargo.
- **Claude:** requiere `claude` instalado y una sesión de Claude Code (`claude auth login`). El modo local exige acceso `claude.ai`, sin herramientas de escritura/archivos/comandos ni complementos. Solo el cazador habilita búsqueda y lectura web públicas. La sesión de Claude no estaba iniciada al comprobar este equipo.
- **Gemini:** conserva el SDK existente. Para generar en este estudio necesita `GEMINI_API_KEY`, `GEMINI_MODEL` y habilitar explícitamente `EZRA_PRODUCCION_IA=1`. No se activó ese gasto como parte de las pruebas. El cazador utiliza Google Search grounding y conserva sus sugerencias en un iframe aislado.

Cada intento se reserva antes de ejecutar y cuenta incluso si falla. El límite actual es 30 intentos mensuales entre las IA, en el mes de El Salvador; se conserva tras reiniciar. Es un límite de llamadas, no una factura ni una garantía de costo monetario. Una llamada simultánea por proceso, con límite de tiempo y tamaño de salida. Una edición concurrente conserva la entrega en otro encargo para no sobrescribir el nuevo trabajo.

Los prompts se envían por stdin, sin shell. El proceso solo hereda las variables necesarias para localizar las herramientas y su sesión; no se le pasan las claves de Gemini, Supabase u otros servicios. Las pruebas de generación usan ejecutores simulados: la disponibilidad real de modelo, cuota y búsqueda se comprueba al usar la cuenta.

## Conexión de lectura con Spotmi

Configura solo en el servidor:

```dotenv
SPOTMI_SITE_URL=https://spotmi.com.sv
SPOTMI_SUPABASE_URL=https://TU_PROYECTO.supabase.co
SPOTMI_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANONIMA
```

Utiliza el mismo proyecto y clave pública que la web. El adaptador rechaza service role y claves privadas. Consulta únicamente los campos públicos de eventos verificados próximos/en curso y spots oficiales verificados; no pide perfiles, usuarios o información de cuentas. No tiene operaciones de escritura en Supabase.

Si no se configura la conexión pública, puede leer `/api/editorial/catalogo` desde la web. Esa ruta se preparó en spotmi-web, pero desplegarla no es necesario para el modo de lectura pública y no se desplegó durante esta tarea.

La consulta real comprobada en esta sesión devolvió 62 fichas: 25 eventos y 37 spots, 37 con imagen. Estos números reflejan ese momento; no son valores fijos ni contenido sembrado.

## Control y proveedores externos

Por decisión del propietario, Ezra no depende de Metricool ni HighLevel. El plugin Metricool se desvinculó de Codex. GoHighLevel no estaba instalado. Las referencias de la interfaz al futuro adaptador GHL se sustituyeron por estados de conexión directa. Las dos variables Metricool antiguas se retiraron de la configuración local de spotmi-web; no estaban referenciadas por su código.

Esto no borra las cuentas de Instagram/Facebook, no cancela suscripciones ni revoca autorizaciones concedidas dentro de Meta. Las cuentas sociales no están conectadas a un publicador de Ezra en esta versión.

## Datos y respaldo

Los encargos se guardan en `data/produccion-spotmi.json`, aparte de los negocios. El archivo se valida antes de usarlo y se conserva intacto si está dañado. La escritura es atómica y exige la revisión vigente para impedir que otra ventana sobrescriba trabajo reciente.

**Conexiones → Respaldar estudio** descarga el JSON de producción. El respaldo del workspace Spotmi también lo incluye. Para restaurar, detén el servidor, guarda una copia del archivo actual y restaura `produccion-spotmi.json` en el directorio de datos de Ezra. No sustituyas el resto de `data/` ni los medios de los negocios por un archivo de ejemplo.

El paquete de un encargo contiene `encargo.md`, `resultado.txt`, `revision.json` y una nota que distingue borrador de versión aprobada. Incluye enlaces a medios; no descarga imágenes de terceros ni adjunta un video renderizado.

## Alcance comprobado y siguientes módulos

Se comprobaron el dominio y la persistencia con pruebas unitarias, autorización/API con el arnés aislado de Clerk del proyecto, y el flujo de edición/revisión/aprobación con Playwright y una cuenta ficticia. Se midió ausencia de scroll lateral a 390 y 360 px. No se inició sesión real en Clerk ni se enviaron tareas reales a los modelos durante las pruebas.

Queda por desarrollar: subida/asociación de medios al nuevo estudio y plantillas gráficas; transcripción, timeline y render de video; propuestas autenticadas de escritura hacia Spotmi; conexión directa y publicación en Meta/TikTok; ingestión de métricas/comentarios y un ejecutor periódico confiable. Los 11 roles ya se pueden encargar y encadenar, pero una hoja de montaje no es un editor de video ni una fecha prevista es una publicación programada en una red.

Los datos de Sgmotos y motoxspress siguen aislados. Los clientes no acceden al estudio global de administración. No se añadieron dependencias de pago, no se hicieron publicaciones ni despliegues y no se modificó la base de producción.

## 2026-10-27 · Interfaz anterior deshabilitada

El propietario pidió una sola interfaz. Se retiraron del catálogo y del bundle visible Chat, Contenido, Bot y Configuración anteriores. Sus URLs redirigen a /azra/produccion para todas las cuentas, incluidos los clientes. El marco anterior (sidebar blanco/lila y sus hojas azra.css/motion.css) dejó de importarse; se utiliza únicamente el marco del Estudio Spotmi. Las cuentas de cliente ven el nuevo diseño en modo de vista sin llamadas a las APIs privadas, sin encargos de administración y sin nuevas autorizaciones. Crear, editar y ejecutar sigue protegido por requireAdmin en el servidor. La información y las APIs del piloto se conservan, pero su interfaz anterior no se monta.

El acceso también usa el estilo oscuro del Estudio Spotmi. La presentación arcade, los estilos globales heredados y las pantallas anteriores ya no se importan. Clerk conserva sus flujos y permisos.

## 2026-10-27 · Granjas

La antigua pestaña «Producción» ahora se llama **Granjas**: rutas, esquemas y `produccion-spotmi.json` conservan sus nombres internos. Dentro hay dos vistas: **Granjas** (flujos de agentes) y **Encargos** (el tablero anterior, sin cambios).

### Usar una granja

1. Empieza con una receta (evento verificado, carrusel de spot o video vertical) o con una granja vacía. Las recetas traen instrucciones con huecos `[Completa aquí…]`, nunca eventos, fotos ni resultados inventados.
2. Agrega pasos (agente, medios, render, tu revisión, publicación). Conéctalos arrastrando desde el punto derecho de un paso hasta otro, o desde el panel lateral con «Conectar con…» (teclado y móvil). Alt + flechas mueve un paso. Guarda: se valida que no haya ciclos, conexiones repetidas ni tipos incompatibles. Un paso puede recibir varias entradas.
3. Cada paso dice en texto qué le falta. Un paso de agente puede vincularse a un encargo existente; desde el editor de encargos también funciona «Colocar en granja».
4. **Ejecutar granja** guarda una instantánea del flujo y de las versiones de sus entradas. Si hay pasos con IA, pide tu consentimiento: cada paso consume 1 de los 30 intentos mensuales, compartidos con los encargos. Gemini sigue apagado mientras `EZRA_PRODUCCION_IA` no sea `1`.
5. Los pasos manuales esperan tu resultado, por ejemplo uno hecho en otro chat. Se etiqueta como «Manual» y nunca como ejecución de una IA. Si el paso tiene fuentes, el trabajador las lee antes y guarda la evidencia.
6. La granja se detiene en **Tu revisión**: hechos, derechos y marca. Después prepara la **vista previa**. Nada se publica sin tu aprobación del contenido exacto, la elección de cuentas y escribir `PUBLICAR`.
7. Pausar, reanudar, cancelar, reintentar un paso fallido o ejecutar un paso suelto. Editar un resultado, una fuente, las instrucciones, el proveedor, los medios o los destinos crea otra versión y desactualiza lo aprobado después. Las versiones anteriores se conservan.

### Personajes

Cada paso muestra su personaje y su estado en texto. Solo se mueve cuando el servidor está trabajando de verdad: «Leyendo fuentes» o «Trabajando». La ficha que viaja por una conexión aparece solo cuando un resultado real pasa al siguiente paso. Con «reducir movimiento» del sistema no hay animaciones.

### Trabajador y almacenamiento

- Base: `data/granjas/granjas.sqlite` (SQLite de Node, modo WAL, transacciones inmediatas, migraciones versionadas; antes de migrar una base existente se copia a `data/granjas/respaldos/`). Medios: `data/granjas/medios/<sha256>.<ext>`, con suma de comprobación, procedencia, nota de permiso y etiqueta de «generado». Los encargos siguen en `data/produccion-spotmi.json`. Todo es local: no es una copia en la nube.
- El trabajador arranca con el servidor (`src/instrumentation.ts`) o aparte con `npm run granjas:trabajador`. Toma trabajos con arriendo, los renueva y los recupera si el proceso se corta. **La Mac debe estar encendida y despierta.** Una hora planificada es local; no es una programación confirmada en la red social.
- **Conexiones → Dónde se guarda** muestra rutas, tamaños, conteos y qué recibió cada servicio externo. El respaldo descargable no incluye tokens.

### Conexiones directas

Instagram, Facebook, TikTok y Spotmi web tienen su propia tarjeta, con estado, cuenta verificada, capacidades, permisos, vencimiento, última verificación y último error. Los tokens se cifran con `EZRA_TOKEN_KEY` y nunca llegan al navegador. Si falta configuración, «Conectar» abre una guía con los nombres que faltan. El estado OAuth es de un solo uso y queda ligado a tu sesión.

| Capacidad | Implementado | Simulado en pruebas | Verificado de verdad | Bloqueado externamente |
| --- | --- | --- | --- | --- |
| Granjas, lienzo, recetas, validación del grafo | Sí | — | Navegador aislado (1440/390/360 px) y primera granja con datos reales | — |
| Cola durable, pausa, reanudación, cancelación, recuperación | Sí | Pruebas unitarias | Trabajador real en el servidor de desarrollo y en la integración | Necesita la Mac despierta |
| Lectura segura de fuentes | Sí | Redes privadas y redirecciones simuladas | Ficha oficial de El Salvador Travel leída el 27/10/2026 | — |
| Pasos con Astra o Claude | Sí (adaptadores existentes) | Sí | No se ejecutó una IA real (sin consentimiento en esta sesión) | Sesión local de Codex o Claude |
| Gemini en granjas | Sí | Sí | — | Apagado: `EZRA_PRODUCCION_IA=0` |
| Render vertical con ffmpeg | Sí | — | MP4 1080×1920 real comprobado con ffprobe | — |
| Instagram (Reels por subida directa) | Sí | OAuth, permisos, cuenta personal y token revocado | No | App de Meta, `INSTAGRAM_APP_ID/SECRET`, redirección https, cuenta profesional. Las imágenes necesitan un enlace público |
| Facebook (Página) | Sí | OAuth, Página, fallo parcial y cuenta cambiada | No | App de Meta, `META_APP_ID/SECRET`, rol con CREATE_CONTENT, redirección registrada |
| TikTok | Solo borrador (`video.upload`) | Subida y estado | No | Publicación directa no permitida para uso interno; app con `video.upload` aprobado; redirección https |
| Spotmi web (propuestas pendientes) | Adaptador en Ezra + migración en spotmi-web | Sí | No | Migración `20261103_propuestas_ezra.sql` sin aplicar; cuenta editorial; `SPOTMI_EDITORIAL_*` |
| Aprobación por huella, autorización, recibos e idempotencia | Sí | Sí, incluidos resultados desconocidos | Sin publicaciones reales | — |

Pendiente de verificar con la consola de cada plataforma: si aceptan una redirección https en `127.0.0.1`. El proxy de Ezra solo responde en loopback, así que un túnel público no sirve sin cambiar esa política.


## Cierre verificado · Granjas · 27 de octubre de 2026

La interfaz de Granjas está integrada en el estudio: recetas, lienzo de agentes, conexiones entre pasos, inspector, encargos vinculados, ejecución manual, revisión y vista previa. Se conserva el código reciente del otro editor; no se sobrescribió el backend de Claude ni la integración concurrente. Conexiones incluye Instagram, Facebook, TikTok y Spotmi, con requisitos y estados reales; una tarjeta visible no acredita una cuenta conectada.

Verificación final de la versión integrada en copia aislada: `npm run check` pasó (lint, TypeScript y 82 pruebas); build con Webpack y `EZRA_DIST_DIR=.next-verificar` pasó; integración HTTP pasó 7/7, incluidas autenticación, roles y Granjas. Navegador a 1440 px: lienzo e inspector visibles; Alt+flecha y Guardar comprobados. A 390 y 360 px, ancho de documento igual al viewport y sin claves g_* visibles. La regla CSS de movimiento reducido se revisó; no se emuló la preferencia del sistema. La build temporal y los servidores de QA se retiran al cerrar.

La comprobación local adicional del encargo `ae58cf22-6697-497a-8b95-5a26cc2c3f41` creó la granja `baa6585d-ee21-4ccf-be0b-67532e722216` («Primera prueba · Instagram»), ejecución `6d697f57-e00f-40a7-9699-0e85eae7d6ec` y pieza `f4470a71-bd41-450c-84d6-808ba36c9cd8`. Se leyó la ficha oficial (HTTP 200), se importó el encargo y se preparó el texto manualmente. Estado: esperando al dueño, 0 autorizaciones y 0 recibos. No se ejecutó IA, no se subieron medios y no se publicó. Informe: `work/primera-prueba-granjas-real.json`. La granja preparada antes por Claude se conserva también; no se borraron datos.

Los registros de la app viven en `data/granjas/granjas.sqlite`; medios en `data/granjas/medios`; encargos previos en `data/produccion-spotmi.json`. No es almacenamiento remoto ni una subida a Spotmi. La migración y sus ataques están preparados en spotmi-web (`20261103_propuestas_ezra.sql` y `supabase/tests/propuestas_ezra.sql`), SIN aplicar ni ejecutar; falta validarlos en una base aislada. No se regeneraron tipos de una migración sin aplicar.

Pendiente externo: conectar y comprobar cuentas reales y permisos, contrastar el anuncio original de Instagram, aportar imagen autorizada si el canal la exige, y aprobación explícita del contenido exacto y de cada cuenta. TikTok queda en envío de borrador y exige video. Spotmi exige migración aplicada y cuenta editorial habilitada. Gemini y servicios de pago no se activaron; no hubo push, merge ni despliegue.

Matriz de capacidades y uso: `docs/GRANJAS_CAPACIDADES.md`. Contenido exacto: `docs/relevos/granjas-spotmi-20261027/PRIMERA_PUBLICACION.md`. El siguiente paso del propietario es revisar ese texto y elegir cuentas; ninguna aprobación documental sustituye la autorización por versión y destinos en la app.
