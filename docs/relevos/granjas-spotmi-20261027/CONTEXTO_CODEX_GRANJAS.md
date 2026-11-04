# Contexto para Codex · Granjas Spotmi construidas por Claude Code

Actualizado: 28 oct 2026. Proyecto: `/Users/rafaelsandoval/Desktop/Spotbot` (rama `feat/migracion-ezra`, sin commits de este trabajo).
Encargo original: `CLAUDE_GRANJAS_SPOTMI.md`. Reglas: `AGENTS.md`, que incluye el apartado «2026-10-27 · Granjas».
**Una sola IA escribe a la vez.** Antes de editar, revisa `git status` y lo que haya cambiado desde este archivo.

## 1. Qué existe y dónde

### Backend · `src/lib/granjas/` (Claude)

| Archivo | Responsabilidad |
| --- | --- |
| `db.ts` | SQLite de Node (`node:sqlite`) en `data/granjas/granjas.sqlite`, en modo WAL, con `busy_timeout` y transacciones `begin immediate` (`transaccion()`). Migraciones con `pragma user_version`; antes de migrar una base existente se copia con `vacuum into` a `data/granjas/respaldos/`. Las rutas llevan `/* turbopackIgnore: true */` (ver §6). |
| `modelo.ts` | Sin dependencias de Node, se puede usar en el cliente. Nodos `agente/medios/render/revision/publicacion`, aristas, `validarGrafo` (ciclo, bucle, nodo inexistente, arista duplicada, tipos incompatibles), `salidasNodo`/`aceptaNodo`, `faltantesNodo`, estados de paso y 3 recetas sin datos inventados. |
| `huella.ts` | `sha256`, `configNodo` (huella del trabajo de un paso, sin posición ni título) y `nodosCambiados`. |
| `almacen.ts` | Granjas: crear, desde receta, duplicar (no copia encargos), actualizar con revisión optimista (409), pausar y archivar (nunca borra). Artefactos tipados con procedencia y `invalidarDesde`/`invalidarPieza`. |
| `cola.ts` | Trabajos con arriendo: `encolar`, `tomar` (concurrencia global), `renovar`, `terminar`, `devolver`, `recuperarVencidos`. Un `publicar` vencido deja su recibo como `desconocido`; nunca se reenvía. |
| `trabajador.ts` | Bucle durable con latido cada 20 s, límite de tiempo por tipo y ranuras de concurrencia (`EZRA_GRANJAS_CONCURRENCIA`). Lo arranca `src/instrumentation.ts`; también corre aparte con `npm run granjas:trabajador`. `EZRA_GRANJAS_TRABAJADOR=0` lo apaga. |
| `ejecucion.ts` | Iniciar (instantánea del grafo, política, canales y versiones de encargos y medios; exige `confirmarIA` si hay IA), `avanzar` y `recalcular`, pausar, reanudar, cancelar, reintentar, completar a mano (origen `manual`, conserva la evidencia), importar encargo (origen `encargo` con versión), editar artefacto (versión nueva y desactualiza lo posterior), aprobar revisión (3 comprobaciones) e `invalidarPorEncargo`. |
| `pasos.ts` | Ejecuta cada tipo de paso. Si el agente tiene fuentes, se leen siempre, también en modo manual (estado `recolectando`). La IA reserva antes 1 uso del límite de 30 al mes, compartido con los encargos (`usos_ia` + `produccion-spotmi.json`). Gemini queda bloqueado si `EZRA_PRODUCCION_IA` no es `1`. El render pasa por `generando`. La publicación crea la pieza y queda en `esperando_autorizacion`. |
| `fuentes.ts` | Lectura segura: solo https y dominios de la política; bloqueo de redes privadas en el `lookup` al conectar (protege del cambio de DNS); revisa cada redirección; 1,5 MB y 12 s como máximo; respeta robots.txt. La evidencia guarda título, extracto breve desde el `h1` (sin nav, header ni footer), `fechas` en español y `publicado` (datePublished). |
| `medios.ts` | Archivos `<sha256>.<ext>` con procedencia, permiso, etiqueta de «generado» y datos de ffprobe. `renderizarVertical`: ffmpeg a 1080×1920, H.264 con audio vacío y faststart, comprobado con ffprobe (este ffmpeg no tiene drawtext: no hay texto sobre el video). |
| `cripto.ts` | AES-256-GCM con `EZRA_TOKEN_KEY` (32 bytes en base64). |
| `adaptadores.ts` | Instagram (Instagram Login; Reels con `upload_type=resumable` y luego `media_publish`; las imágenes se bloquean porque necesitan una URL pública), Facebook (Páginas, tarea CREATE_CONTENT, `/feed`, `/photos` y video), TikTok (siempre `restringida`, solo borrador `inbox/video/init` hasta SEND_TO_USER_INBOX) y Spotmi web (contraseña de la cuenta editorial y luego las RPC `ezra_identidad_editorial`, `ezra_proponer_evento` y `ezra_estado_propuesta`). `leerJson` clasifica los errores como vencido, permiso, ambiguo o rechazo. Graph `v26.0` (`META_GRAPH_VERSION`). |
| `conexiones.ts` | Estados `sin_configurar`, `requiere_oauth`, `conectada_lectura`, `conectada_publicacion`, `vencida`, `restringida` y `verificacion_fallida`. OAuth: estado de 32 bytes, de un solo uso, que caduca en 10 minutos y queda ligado al `userId` de Clerk. También verificar, elegir Página, desconectar (revoca en la plataforma si se puede) y `usarRedDePrueba()` para las pruebas. |
| `pieza.ts` | Esquema del contenido que se aprueba (textos por canal, medios con sha, enlaces, canales, programación ahora/local, divulgaciones, datos para Spotmi y fuentes) y `CONFIRMACION_PUBLICAR = "PUBLICAR"`. |
| `publicacion.ts` | Hash canónico, versiones de la pieza, aprobación por hash, `revisarDestinos` y `simular` (sin red), `autorizarPublicacion` (hash, aprobación vigente, destinos con capacidad e identidad, clave de idempotencia por hash, canal, cuenta e intento previo fallido), `ejecutarPublicacion` (vuelve a revisar todo y marca `enviando` antes de tocar la red), `confirmarRecibo` (consulta el estado real) y `resolverDesconocido`. **Otra sesión añadió aquí el transporte n8n (§5).** |
| `api.ts` | `administrador()` (requireAdmin + userId de Clerk), `cuerpo()` (Zod y límite de tamaño) y `errorApi()`. |

### API (todo exige administración)

`src/app/api/granjas/route.ts` (resumen, crear, receta, duplicar, actualizar), `[id]` (estado completo para consultar cada 2 o 10 s), `ejecuciones` (iniciar, pausar, reanudar, cancelar, reintentar, manual, importar, aprobar, editar artefacto), `medios` (subida con nota de permiso obligatoria) y `medios/[id]` (rangos, `no-store`), `conexiones` (GET y verificar, desconectar, conectar Spotmi, elegir Página), `conexiones/[canal]/autorizar`, `piezas` (editar, aprobar, simular, autorizar, resolver) y `almacenamiento` (estado y respaldo ZIP sin tokens).
La respuesta OAuth vuelve a **`src/app/conexiones/[canal]/callback/route.ts`**, fuera de `/api`, porque `src/proxy.ts` bloquea en `/api` las navegaciones que llegan de otro sitio. Aun así exige la sesión de administración.

### Interfaz · `src/features/azra/granjas/` (Claude)

`granjas.tsx` (`SeccionGranjas`: recetas, lista, editor con borrador local del grafo, Guardar, Duplicar, Pausar, Archivar, ejecución con diálogo de consentimiento, historial y vistas previas), `lienzo.tsx` (nodos HTML y aristas SVG, zoom y paneo, asas de conexión, Alt + flechas, ajuste inicial y ficha de traspaso solo cuando una salida real llega al siguiente paso en menos de 8 s), `inspector.tsx` (configuración por tipo, conexiones sin arrastrar, faltantes, último paso, manual, importar, aprobar, reintentar, ejecutar uno), `vista-previa.tsx` (vista por canal, versión nueva al editar, aprobación por hash, simulación, autorización con PUBLICAR, recibos y resolución de desconocidos), `conexiones.tsx` (4 tarjetas, guía con los nombres de configuración que faltan, «Dónde se guarda»), `colocar.tsx` («Colocar en granja» desde el editor de encargos), `pixel.tsx` (personaje extraído de `estudio.tsx`; solo se anima en `recolectando` y `generando`), `cliente.ts` (tipos y `pedir`) y `granjas.css` (clases `eg-*` con las variables `--ep-*`; respeta `prefers-reduced-motion`).
Integración en `src/features/azra/produccion/estudio.tsx`: la pestaña `cola` se muestra como «Granjas», con subpestañas Granjas y Encargos (el kanban de antes); Conexiones muestra `ConexionesGranjas` en lugar de la tarjeta genérica de redes; lee `?seccion=` y `?conexion=` al volver de OAuth.
Textos: claves `g_*` en `src/features/azra/messages/{es,en}.json`, más `p_cola`, `p_mas`, `p_colaAyuda`, `studioAdminHome` y `p_metaDescripcion`. Las claves dinámicas son `estado_*`, `con_*`, `cap_*`, `tipo_*`, `nodo_*`, `agente_*` (igual que `p_*_titulo`), `origen_*`, `rec_*`, `comprobar_*`, `spotmi_*`, `guia_*`, `granja_*`, `ejec_*`, `pestana_*` y `receta_*`.

### Pruebas (Claude)

- `tests/granjas.test.ts`, 11 pruebas: grafo; CRUD y relectura tras «reinicio»; ejecución manual con pausa, reanudación, cancelación y desactualización; IA simulada con consentimiento, fuentes, límite de 30 y Gemini apagado; arriendos y envío cortado que queda «desconocido»; fuentes (redes privadas, dominios, redirecciones, robots y extracción); cifrado; OAuth simulado (estado de otra sesión, uso doble, permiso negado, cuenta personal, token revocado); publicación (hash, simulación sin red, edición tras aprobar, PUBLICAR, desconocido sin reenvío, idempotencia, cuenta cambiada); multicanal con un fallo parcial y TikTok en borrador; render MP4 real y su invalidación.
- `tests/integration/granjas.test.ts`: 401 y 403 para clientes, trabajador real con datos en `work/`, 409 por revisión, conexiones sin éxito simulado, callback sin estado válido, origen de otro sitio bloqueado y respaldo ZIP. **Otra sesión editó este archivo después** (revisa el diff).

## 2. Flujo de una granja

1. Ejecutar crea una ejecución con instantánea y deja en `en_cola` los pasos sin antecesores; el resto queda `esperando`.
2. El trabajador toma cada paso. `medios` crea artefactos imagen o video. Un agente lee sus fuentes (`recolectando`) y luego queda en `esperando_manual` o pasa a la IA (`generando`). `render` pasa por `generando`. `revision` queda en `en_revision`. `publicacion` crea la pieza y queda en `esperando_autorizacion`.
3. Revisión: el propietario marca hechos, derechos y marca → `aprobado`, que deja pasar sus entradas.
4. Pieza: aprobar el hash, simular, elegir destinos y escribir PUBLICAR. Eso crea la autorización, los recibos `pendiente` y los trabajos `publicar` (con hora local opcional). El trabajador publica y confirma; un resultado ambiguo queda `desconocido` y lo resuelve el propietario.
5. Invalidación: editar un nodo, sus aristas, la política de fuentes, un artefacto, la pieza o la versión de un encargo vinculado invalida las aprobaciones y autorizaciones posteriores, y marca los pasos como `desactualizado`. Nada se borra.

## 3. Estado real en los datos del propietario (`data/granjas/`)

- «Primera prueba · Noche de Catrinas (Ataco)», creada por Claude. Ejecución `58b54357…` en `esperando_dueno`: el cazador está vinculado al encargo `ae58cf22…` (v2 importado) y el trabajador leyó la ficha oficial el 27/10 (31 de octubre de 2026 en Concepción de Ataco, publicada el 10/10/2026, sin horario). La revisión de hechos y el texto se completaron a mano. Está **detenida en «Tu revisión»**. La ejecución anterior `c3401d4e…` se canceló y queda en el historial. No tiene paso de medios (falta una imagen con permiso). Notas en `PRIMERA_PUBLICACION.md`.
- También hay varias «Publicación de evento verificado», un «Carrusel de un spot» y «Primera prueba · Instagram». Claude no las creó: vienen de clics del propietario en las recetas o del script `scripts/granjas-primera-prueba.ts` de otra sesión.
- 0 recibos y 0 conexiones: **no se publicó nada ni hay cuentas conectadas.**

## 4. Verificado por Claude (27 oct)

`npm run check` con 82/82, compilación con `EZRA_DIST_DIR=.next-verificar`, `EZRA_DIST_DIR=.next-verificar npm run test:integration` con 7/7 y navegador aislado a 1440, 390 y 360 px sin desbordamiento, incluido el recorrido completo hasta la simulación. Los últimos ajustes visuales fueron: controles de zoom fuera del lienzo, nombre completo de cada paso, avisos de éxito que desaparecen a los 4 s y fuentes agrupadas. Esos ajustes se comprobaron con lint, tipos y un arnés visual, sin repetir la integración.

## 5. Cambios de otra sesión, no hechos por Claude

Según `docs/DECISIONS.md` y `docs/TASKS.md` del 27/10: `src/lib/granjas/n8n.ts`, `src/features/azra/granjas/n8n.tsx`, `src/app/api/granjas/n8n/**`, `docs/n8n/ezra-meta.json`, `docs/N8N_META.md`, `docs/GRANJAS_CAPACIDADES.md`, `scripts/probar-n8n*.mjs` y `scripts/granjas-primera-prueba.ts`. Además, `src/instrumentation.ts` ahora carga `.env.meta.local`. Con `EZRA_N8N_PUBLICACION=1`, la publicación y la confirmación de Facebook e Instagram pasan por `https://spotmi.app.n8n.cloud` (con límite de 8 MB), y el OAuth de Meta puede volver por `…/webhook/ezra-oauth-<canal>`. Esa sesión informó 88 pruebas. Claude no revisó a fondo estos cambios: léelos antes de tocarlos.

## 6. Trampas conocidas

- `next build` y cualquier `next dev` adicional **reescriben `tsconfig.json` y `next-env.d.ts`**. Guarda una copia antes y restáuralos después, y borra `.next-verificar` o `.next-visual`.
- Sin `/* turbopackIgnore: true */` en las rutas de datos, la compilación falla al recorrer el enlace roto `.venv/bin/python`.
- El trabajador vive en el proceso de `next dev`: después de cambiar `lib/granjas`, **reinicia el servidor** para que use el código nuevo.
- El proxy solo responde en loopback. Instagram y TikTok exigen una redirección https; un túnel público no sirve sin cambiar esa política (o el puente de n8n del §5).
- Arneses visuales sin versionar: `work/granjas-visual.mts` y `work/granjas-flujo.mts`. Usan Clerk sin red (los errores de carga de clerk-js son esperables), datos en `work/`, los puertos 3127 y 3128 y Playwright desde `/Users/rafaelsandoval/dev/spotmi-web/node_modules`.
- En zsh, `echo =====` falla por la expansión de `=`; usa comillas.

## 7. Pendiente

1. Propietario: aprobar «Tu revisión» de la primera prueba, aportar una imagen con permiso, elegir las cuentas y el texto exacto y luego autorizar. Ninguna IA puede hacerlo por él.
2. Propietario: apps de Meta y TikTok y `EZRA_TOKEN_KEY` en `.env.local` (nunca en el chat). Decidir entre OAuth directo o el puente de n8n.
3. spotmi-web: la migración `20261103_propuestas_ezra.sql` está **sin aplicar**; la bandeja muestra `ezra` como «analizador» y «San Miguel» aparece repetido. Su aplicación requiere autorización, una base aislada y regenerar los tipos.
4. Ordenar las granjas repetidas con Archivar (nunca borrar) si el propietario lo pide.
5. Si cambias código: `npm run check`, compilar en `.next-verificar`, correr la integración y restaurar los archivos de configuración.

## 8. Prohibido

Publicar o subir algo real sin la aprobación del contenido exacto y de las cuentas. Activar Gemini o un servicio de pago. Hacer push, merge o despliegue. Reintroducir Metricool o HighLevel. Sembrar datos en `data/`. Escribir secretos en el chat, la documentación o los registros. Commitear secretos. El archivo `x` contiene una clave de Gemini en texto plano; ya está ignorado (`/x` en `.gitignore`), al igual que `.env.meta.local` y `.env.n8n.local`. Compruébalo con `git check-ignore -v` antes de cualquier commit.
