# Estado y relevo

## 2026-11-17 · Eventos e Instagram (rama `feat/eventos-instagram`)

### Fase 0 · Supabase de desarrollo — preparada, falta tu parte
- [x] `.env.local` apunta al ref `bvmzrmvrdbfpkdhwazgv`. La CLI de spotmi-web (2.116, en `node_modules`) está vinculada a ese ref pero **sin sesión**: `migration list` y `migration repair` piden `supabase login`.
- [x] Lectura pública (solo `select`/RPC con la clave anónima): 20261103 sin aplicar (las RPC dan 404) y **20261102_plan_spotmi.sql tampoco está aplicada** (`plan_members` no existe). Por eso no se usa `db push`: subiría también la del plan.
- [x] 20261103 ampliada (tú lo elegiste): la RPC acepta además hora HH:MM, municipio y categoría; prueba de ataque con 3 casos nuevos.
- [x] Migración nueva `20261117_eventos_conteo_solo_equipo.sql` + `supabase/tests/eventos_conteo_solo_equipo.sql`: amplía el trigger vigente con `verification_count` (no la versión literal, que bloqueaba la moderación).
- [x] `work/supabase-probar-sin-aplicar.sql` (aplica y prueba todo dentro de una transacción que se revierte), `work/supabase-aplicar.sql` y `work/supabase-habilitar-editorial.sql`.
- [ ] Propietario: correr la prueba sin aplicar, luego aplicar, `migration repair`, crear la cuenta editorial, habilitarla, poner `SPOTMI_EDITORIAL_EMAIL`/`SPOTMI_EDITORIAL_PASSWORD` y pulsar Conexiones → Spotmi web → Conectar/Verificar.
- [ ] spotmi-web: la bandeja del equipo sigue mostrando el origen `ezra` como «analizador» (UI de spotmi-web, fuera de este alcance).



### Fase 1 · Limpieza y consumo — HECHO
- [x] Menú: Granjas · Eventos · Consumo · Calendario · Conexiones. `?seccion=` retiradas (equipo, fuentes, cola) abren Granjas. La lectura pública de Spotmi quedó en Conexiones.
- [x] 9 granjas archivadas con el backend (7 «Publicación de evento verificado» y 2 «Primera prueba»), sin borrar filas. Filtro «Ver archivadas» y botón Restaurar. Script: `scripts/granjas-archivar-duplicadas.ts`.
- [x] Especialistas nuevos `verificador`, `redactor_ig`, `disenador_post`; visibles por defecto solo esos tres y el cazador. Los demás se reactivan en Granjas › Especialistas visibles.
- [x] Una sola función a Gemini (`src/lib/ia/gemini.ts`) para granjas, encargos y Ask. Registro en `consumo_ia` (SQLite, migración 3). Pantalla Consumo con hoy/semana/mes, 30 días, por granja, por paso y las 20 más caras.
- [x] Presupuesto diario y mensual editable (aviso al 80 %, Gemini se detiene al 100 % y se reanuda al día o mes siguiente). Tarifas por modelo editables; el código no trae precios. Gemini ya no consume los 30 intentos (decisión del propietario); Astra y Claude sí.
- [x] Verificación: check 92/92, build en `.next-verificar`, integración 7/7.
- [ ] Nota: la prueba de integración de n8n aceptaba solo «sin_configurar»; en esta Mac `.env.n8n.local` existe y da «sin_verificar». Se acepta cualquiera de los dos (nunca «conectada» sin verificar).


### Fase 2 · Granja «Eventos de El Salvador» y bandeja — HECHO (falta la prueba real)
- [x] Receta: Cazador (Gemini + búsqueda de Google, JSON) → Verificador sin IA (proveedor nuevo `local`). Fuentes iniciales `elsalvador.travel` y `gob.sv` (MITUR, Cultura, ISTU y alcaldías); ticketeras y recintos se agregan en Personalizar. Redes sociales bloqueadas aunque se agreguen.
- [x] Verificador: lee la página (robots, https, dominios permitidos), confirma fecha, hora y precio solo si aparecen; si no, quedan «por confirmar» con la sugerencia del cazador aparte. Descarta páginas que no mencionan el evento, fechas pasadas o fuera de 14 días, y duplicados contra Ezra, Spotmi público y la misma búsqueda.
- [x] Tabla `eventos` (migración 4) y máximo por día (por defecto 10, también por ejecución).
- [x] Bandeja Eventos: filtros por estado y fechas; Aprobar, Descartar con motivo, Editar (vuelve a «nuevo»), imagen con permiso, Copiar ficha, CSV/JSON del día.
- [x] «Enviar a Spotmi» con la RPC y clave de idempotencia guardada antes de llamar; consulta de estado. Editar se bloquea si hay un envío sin confirmar.
- [x] Verificación: check 98/98, build en `.next-verificar`, integración 7/7.


### Fase 3 · Post para Instagram y horario — HECHO (LaunchAgent sin instalar)
- [x] Receta «Post para Instagram»: Redactor (Gemini, valida 2.200 caracteres, fecha, lugar, «Más info en spotmi», 5–10 hashtags, sin hora ni precio sin confirmar; dos intentos y luego plantilla sin IA) → Diseñador sin IA (next/og, PNG 1080×1350, azul `#002f4b`, ícono oficial de Spotmi; fondo solo con permiso registrado). Tabla `posts_ig` (migración 5).
- [x] Eventos › Posts de Instagram: Descargar imagen, Copiar texto, editar texto, Rehacer imagen y Marcar como subido a IG (pide el enlace).
- [x] Horario por granja (tabla `horarios`): activa, hora, días, máximo por día, cuenta de destino, encadenado. Reloj de 1 minuto en el trabajador; tarea perdida una vez; nunca dos veces el mismo día; pausa por presupuesto con motivo y reanudación.
- [x] LaunchAgent: `ops/macos/com.spotmi.ezra.trabajador.plist` + `scripts/trabajador-instalar.sh` / `trabajador-desinstalar.sh` (validados con `plutil`, no instalados).
- [x] Calendario muestra los eventos aprobados por día.
- [x] Datos reales: creadas «Eventos de El Salvador» y «Post para Instagram» sin horario activo (`scripts/granjas-crear-diarias.ts`).
- [x] Verificación: check 103/103, build en `.next-verificar`, integración 7/7, navegador aislado a 1440 y 390 px sin desborde en Granjas, Eventos, Posts, Consumo y Calendario.

### 18 nov · Tope, Gemini encendido y primer intento del Cazador
- [x] Presupuesto guardado con `guardarPresupuesto()`: 200.000 tokens/día y 3.000.000/mes. Se lee en cada llamada (sin caché). Tarifas por modelo: vacías, se llenan en Consumo.
- [x] `EZRA_PRODUCCION_IA=1` y clave bien escrita (53 caracteres, sin comillas ni espacios). Llamada mínima por `llamarGemini()`: «OK», 6 tokens, `gemini-3.5-flash-lite`, registrada como «Prueba de conexión».
- [x] «Eventos de El Salvador»: máximo 3 eventos por día para la prueba (revisión 2).
- [x] Primer intento del Cazador: HTTP 429 RESOURCE_EXHAUSTED con búsqueda de Google (el plan gratuito no la incluye para Gemini 3.x). Ahora el error se explica en español; cada paso de Gemini tiene «Usar búsqueda de Google» (activada por defecto en el Cazador); sin búsqueda, el Cazador extrae eventos solo del texto y los enlaces de sus Fuentes; con búsqueda, un 429 reintenta una vez sin ella si hay Fuentes.
- [ ] Propietario: agregar Fuentes al Cazador de tu granja (la receta nueva ya las trae: `https://elsalvador.travel/esp/eventos/`, `https://www.cultura.gob.sv/feed/`, `https://istu.gob.sv/feed/`), o activar la facturación en AI Studio para usar la búsqueda.
- [ ] Propietario: visto bueno a los dominios propuestos (`smartticket.fun`, `funcapital.com`); falta un editor de dominios en la interfaz.
- [ ] Cierre: compilación en una copia aislada (para no reiniciar el servidor del puerto 3000).

### 18 nov · Primera ejecución real de «Eventos de El Salvador»
- [x] 00:02: la búsqueda de Google dio 429 (0 tokens) y el reintento solo con Fuentes funcionó: 12.379 tokens (8.805 entrada, 3.574 salida), 13,9 s. Verificador: 15 revisados, 10 nuevos en la bandeja (fecha confirmada en `elsalvador.travel/esp/event/…`; hora y precio «por confirmar»), 4 duplicados y 1 descartado por fecha pasada.
- [x] Corregido: «Fiestas patronales de Apopa» se tomó como duplicado de «… de Armenia» (pesaban las palabras genéricas). Ahora solo cuentan las palabras distintivas; pruebas con el caso real.
- [x] Se archivaron 4 copias de «Eventos de El Salvador» creadas al pulsar la receta varias veces; queda `202dfe90…`.
- [ ] Propietario: revisar los 10 eventos (algunos no son de turismo: EmTech AI, cumbre de Bitcoin). Volver a ejecutar para recuperar Fiestas patronales de Apopa si sigue en la ventana.

### 18 nov (tarde) · Imagen oficial, importación, barrido nov–dic y búsqueda diaria
- [x] Parte 1 (`54fad07`): el verificador baja la imagen de la ficha oficial (og:image → twitter:image → imagen schema.org → imagen principal; luego la página de boletos). JPG/PNG/WebP, ≤ 8 MB, lado menor ≥ 600 px, validada por contenido, nunca de redes sociales ni sus CDN. Queda «pendiente de tu confirmación»; el post solo la usa tras «Usar imagen de la fuente». Botones «Buscar imagen» y «Cambiar imagen».
- [x] Parte 2 (`92b2baf`): «Importar JSON» en Eventos y `npm run eventos:importar -- archivo.json [--dominios=a.sv,b.com]`, por el mismo verificador. Migración 6: `fecha_fin` e `imagen_confirmada` (respaldo en `data/granjas/respaldos/`). Hora «08:00 PM» con cero inicial ya se confirma. Duplicados más finos (departamentos no cuentan como palabra distintiva).
- [x] Barrido: `work/eventos-nov-dic-2026.json`, 61 eventos (17 de la semilla + Smart Ticket + MITUR). Importados: 51 nuevos, 10 duplicados (ya en Spotmi), 0 descartados; 4 con imagen pendiente de confirmar; 42 con hora o precio por confirmar. Contradicciones anotadas en «nota de verificación» de cada evento (Allison, Apopa, Alejandro Sanz, Villa Navideña, Quezaltepeque).
- [x] Parte 3 (`1428fb5`): granja `202dfe90…` con ventana de 45 días, máximo 10/día, dominios añadidos `smartticket.fun`, `todoticketsv.com`, `funcapital.com`, fuente «Cartelera de Smart Ticket». El prompt recibe hasta 200 eventos vigentes de la bandeja. Horario activo a las 04:30 todos los días (primera ejecución: 19 nov). Resumen de la última ejecución en Granjas (nuevos, duplicados, con imagen, tokens).
- [x] Cierre: check 113/113; build y integración 7/7 en un worktree aislado (sin tocar el servidor del 3000).
- [ ] Propietario: reiniciar `npm run dev` para que el trabajador cargue el código nuevo antes de las 04:30.
- [ ] Propietario: instalar el LaunchAgent (no está instalado) o dejar `npm run dev` abierto: `bash scripts/trabajador-instalar.sh` y `sudo pmset repeat wakeorpoweron MTWRFSU 04:25:00`.
- [ ] Propietario: decidir si se archiva la copia `4917b7e8…` de «Eventos de El Salvador» (creada hoy a las 14:17 desde la receta; sin horario; los 51 importados quedaron asociados a ella, archivar no los borra).
- [ ] Limitaciones: `todoticketsv.com` responde 500 al agente de Ezra y `funcapital.com` es una página solo con JavaScript: permitidas para enlaces, pero no se pueden leer. La prensa (`elsalvador.com`) solo se usó en esta importación (`--dominios`). La RPC de Spotmi no lleva `fecha_fin` (va en la descripción); ampliarla es opcional.
- [ ] Revisar los 4 eventos con imagen y confirmar o cambiar la imagen; revisar Kany García (sin recinto ni ficha oficial).

### 18 nov (noche) · Imágenes, fuentes por API, confianza y actualización diaria
- [x] Parte 1 (`24c93f9`): «Completar imágenes» en la bandeja (progreso, Detener, resumen por motivo) y `npm run eventos:imagenes`. Orden: página fuente, boletos y otras fuentes web → ficha en la cartelera de ticketeras permitidas (título y fecha; pasa a «boletos» y a las fuentes) → imagen del post de una cuenta oficial leído por API. Descarta logos, la portada del sitio y las imágenes que usan ya 2 o más eventos. Nunca genera imágenes (decisión del propietario: sin IA); sin imagen, cuadro azul con el día y el mes.
- [x] Parte 2 (`dd1d43c`): migración 7 (`evento_fuentes` con todas las URL de cada evento, `origen`, instantánea de confianza, `cambios`). «Cuentas a seguir» (Instagram y Facebook, en Eventos). Instagram por Business Discovery con la conexión de **Facebook** (la de Instagram no sirve), Gemini extrae eventos del texto del post y el verificador confirma contra ese texto; la fuente es siempre el enlace del post. Facebook: listo y apagado (`EZRA_FACEBOOK_PPCA=1` tras la aprobación de Meta). TikTok: sin API permitida → «Pegar enlace». Guía en Conexiones › Facebook.
- [x] Parte 3 (`d66597e`): círculo de confianza con desglose (cursor y teclado), filtro «Revisar con cuidado (< 50 %)», orden por confianza y «Confianza por dominio» editable en Eventos (no hay sección Ajustes en el menú reducido).
- [x] Parte 4 (`90fc428`): lectura diaria en orden Fuentes web → Instagram → Facebook → búsqueda de Google; ventana de 60 días (receta y granja `202dfe90…`, revisión 3). Un evento repetido suma su URL y recalcula la confianza; si su propia fuente cambia fecha, hora, lugar o precio queda «Actualizado» con antes y después y vuelve a revisión. El máximo diario limita solo los nuevos. Resumen: nuevos, actualizados, duplicados (con fuente nueva), imágenes, tokens y costo estimado.
- [x] Datos reales: base migrada a la versión 7 (respaldo automático `granjas-v6-2026-11-19T04-01-00-811Z.sqlite` y copia manual `granjas-v6-antes-fuentes-confianza-manual.sqlite`). Lote de imágenes: 57 eventos sin imagen → 0 imágenes (MITUR no publica imagen del evento; Smart Ticket solo un banner de 1238×556, bajo el mínimo de 600 px de lado menor). 2 eventos ganaron su ficha de Smart Ticket como boletos y fuente. Confianza de los 61: 12 alta, 45 media, 4 baja.
- [x] Verificación: check 121/121, build en `.next-verificar` (2 advertencias previas de `src/instrumentation.ts`), integración 7/7, arnés `work/eventos-fuentes-visual.mts` a 1440, 1024 y 390 px sin desborde, desglose con cursor y teclado, Escape en «Pegar enlace».
- [ ] Propietario: decidir si los banners de Smart Ticket (1238×556) valen como imagen (hoy la regla pide ≥ 600 px de lado menor); con eso 12 eventos tendrían imagen.
- [ ] Propietario (Meta): app con inicio de sesión de Facebook, Página de Spotmi vinculada a la cuenta profesional de Instagram, permisos `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`; para modo publicado, revisión de la app (acceso avanzado) y verificación del negocio. Luego `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `EZRA_TOKEN_KEY` en `.env.local`, Conexiones › Facebook › Conectar y elegir la Página. Facebook Páginas públicas: solicitar «Page Public Content Access».
- [ ] Propietario: agregar las cuentas en Eventos › Cuentas a seguir y reiniciar `npm run dev` antes de las 04:30 (el trabajador carga el código nuevo al arrancar).

### 19 nov · Imágenes: afiche, prensa, referencia IA y tarjeta estilo ticketera
- [x] Parte 1 (`07c9b6e`): causa de Smart Ticket = tamaño (1238×556), no el CDN. Afiche de 300–599 px aceptado como «baja resolución»; foto de prensa con menor prioridad; orden afiche › post oficial › prensa › IA › cuadro azul; historial de imágenes. Migración 8 (`imagen_tipo`, `imagen_baja`, `precio_desde`, `evento_imagenes`).
- [x] Parte 2 (`ff54538`): referencia IA con Gemini (`prompt-imagen.ts`, `escenas-categoria.ts`, `imagen-ia.ts`), límite «Imágenes IA por día» en Consumo, control con un reintento, aviso de facturación, especialista `imagen_evento` («Imagen») después del Verificador.
- [x] Parte 3 (`ca64e62`): tarjeta 4:5 estilo ticketera (afiche con contain sobre fondo desenfocado, etiquetas, confianza, «Desde $X», «Ver más →»), panel lateral con todas las acciones, cuadrícula 4 · 2 · 1.
- [x] Datos reales: base en versión 8 (respaldo `granjas-v7-2026-11-19T04-39-17-699Z.sqlite`). Lote oficial: 12 afiches de Smart Ticket (baja resolución), 4 fotos de prensa (las de elsalvador.com reclasificadas), 45 sin imagen. Granja `202dfe90…` con el paso «Imagen» (revisión 4).
- [x] Verificación: check 125/125, build en `.next-verificar` (2 advertencias previas de `src/instrumentation.ts`), integración 7/7, arnés `work/eventos-fuentes-visual.mts` a 1440, 1024, 390 y 360 px sin desborde; panel con Escape.
- [ ] **Prueba real de 3 imágenes IA: bloqueada.** Google respondió 429 «cuota gratuita en 0» (18 nov, 22:5x, hora de El Salvador) para `gemini-3.1-flash-lite-image`: la facturación aún no está activa en el proyecto de la clave. Cuando lo esté: `npm run eventos:imagenes -- --ia --solo=008dfea6,b6175dd7,52c170e6` (Fiestas patronales de Suchitoto, Concierto de Kapo, Pro Tour nacional de surf) e imprime el prompt de cada una; el costo queda en Consumo.
- [x] Alternativa sin facturación (elegida por el propietario): en el panel del evento, «Copiar prompt para la app de Gemini» y «Subir imagen de referencia IA». La imagen subida queda «IA · referencia» con el prompt guardado, no usa la API ni el límite diario y nunca es oficial. El plan de estudiante (Google AI Pro) cubre la app de Gemini, no la API.
- [ ] Propietario: en Consumo › Tarifas, agregar `gemini-3.1-flash-lite-image` (salida US$ 30 por millón de tokens de imagen ≈ US$ 0,034 por imagen) para ver el costo estimado.
- [ ] Propietario: decidir si los 12 afiches en baja resolución se confirman tal cual.

### 20 nov · La búsqueda diaria ya no falla por red ni por el paso «Imagen»
- [x] Causa del 19 nov: el paso «Imagen» revisaba 9 eventos sin tope y releía carteleras y portadas por cada evento; superó los 8 min del trabajador y la ejecución quedó «fallida» aunque los 9 eventos ya estaban en la bandeja. Ahora: máximo 75 s por evento y 5 min en total, lecturas compartidas en el lote; lo que no alcanza queda «para Completar imágenes» y el paso termina bien.
- [x] Causa del 20 nov: «fetch failed» en 94 ms (la Mac despertó a las 7:47 sin red todavía). Errores de red, Gemini saturado o tardanza ya no fallan el paso: vuelve a la cola y reintenta en 1, 3 y 10 min (código `red` en `src/lib/ia/errores.ts`, `ESPERAS_REINTENTO` en `pasos.ts`). Tras el cuarto intento sí falla.
- [x] Pruebas nuevas en `tests/gemini-errores.test.ts` y `tests/eventos-fuentes.test.ts`. Check 141/141.
- [ ] La ejecución de las 04:30 sigue dependiendo de que `npm run dev` esté abierto y la Mac despierta (LaunchAgent y `pmset`, abajo).

### 20 nov · Director de arte: post y carrusel con Claude, Astra o Gemini
- [x] `src/lib/granjas/director.ts`: la IA elige estilo (afiche, dividido, tipográfico), paleta (noche, atardecer, selva, volcán, crema), encuadre, gancho, titular y 0–4 láminas de carrusel, como JSON. Validación: estilos y paletas cerrados, titular del mismo evento, sin hora ni precio sin confirmar, sin enlaces ni cuentas; dos intentos y luego plantilla con la nota del motivo.
- [x] `diseno.ts`: tres estilos, cinco paletas, láminas interiores y lámina de cierre (la escribe Ezra). Todo PNG 1080×1350 en local; la IA no genera píxeles.
- [x] Migración 10 (`posts_ig.diseno`, `diseno_origen`, `diseno_nota`, `carrusel`). «Rehacer imagen» sin IA conserva el diseño elegido.
- [x] Granja: el paso «Diseñador de post» acepta Claude, Astra o Gemini (la receta sigue en local por defecto). Web: Eventos › Posts › «Rediseñar con…» (`/api/granjas/posts`, `src/lib/granjas/director-web.ts`). Astra y Claude gastan de los 30 intentos al mes (cada intento cuenta); Gemini, del presupuesto de tokens.
- [x] UI: miniaturas del carrusel, descarga por lámina, quién hizo el diseño.
- [x] Check 145/145, build en `.next-verificar`, integración 7/7. No revisado en navegador todavía; sin llamadas reales a Claude ni Astra.
- [x] Video vertical 9:16 (`src/lib/granjas/video.ts`, migración 11 con `posts_ig.video_*`): Claude, Astra o Gemini escriben el guion (paleta, titular, 1–4 escenas de 2–5 s) con las mismas reglas; Ezra agrega portada (afiche autorizado o tipográfica) y cierre, dibuja cada escena 1080×1920 y ffmpeg las une con acercamiento lento y fundidos. Sin música (se pone en Instagram/TikTok). Eventos › Posts › «Crear video 9:16» con el proveedor elegido; reproductor y descarga. Muestra real: 13,5 s en 3 s. Check 147/147. Base real en versión 11 (respaldo `granjas-v10-…`).
- [x] Referencia IA con Astra (`src/lib/ia/astra-imagen.ts`): Codex con tu sesión de ChatGPT, sin claves; solo la herramienta `image_generation` (sin comandos, archivos ni búsqueda, sandbox de solo lectura); toma la imagen de `~/.codex/generated_images/<sesión>/`. Botón «Crear con Astra» en el panel del evento (`generar_referencia` con `proveedor: "astra"`). Un intento por imagen, gasta 1 de los 30 al mes, cuenta en el límite diario de imágenes IA y en Consumo (costo 0: va por tu plan). Control de texto/logos/personas solo si Gemini está encendido; si no, nota «revísala tú». Nunca oficial. Límite de ChatGPT con mensaje claro. Check 149/149, build, integración 7/7.
- [ ] Prueba real con Astra (después de las 12:07 del 20 nov, cuando se libera el límite de ChatGPT). Antes: Codex 0.162 tiene `image_generation` y guarda en `~/.codex/generated_images/<sesión>/`; la prueba del 20 nov no corrió (límite de uso de ChatGPT hasta las 12:07).

### 20 nov · Rediseño Fase 1: base visual, menú e Inicio «Pulso» (plan en ~/.claude/plans/vivid-questing-flask.md)
- [x] `src/features/azra/produccion/tokens.css`: tipografía display del sistema, tracking negativo, fondo #F7F7F8 con degradados lavanda/azul, tarjetas radio 20 con halo, pills y botones negros ↗; temas por sección `data-tema` claro / oscuro / líquido. Mapeado sobre `--ep-*` (el resto de pantallas hereda el estilo).
- [x] Navegación: píldora negra «Menú · N % del día» en el centro de la barra superior y «Nuevo encargo ↗» a la derecha (`produccion/menu.tsx`, espacios `#ez-barra-centro` y `#ez-barra-accion` en `shell.tsx`). Sin barra lateral. % del día = acciones resueltas hoy (auditoría: aprobar/descartar eventos, confirmar imagen, post subido, aprobar paso o pieza, más encargos aprobados hoy) ÷ (resueltas + pendientes).
- [x] Inicio (`produccion/inicio/`): hero con ícono incrustado, esfera de cristal, fondo líquido WebGL propio (pausa fuera de pantalla; movimiento reducido = un cuadro; sin WebGL, degradado), estadísticas reales y los robots pixel asomándose por un monitor con el pulso en vivo (rebote, parpadeo, tooltip con el rol). Tablero con KPIs, gráfica SVG con pestañas (30 días y próximos 14), Atención, Próximas fechas, Instagram, Granjas y Agentes.
- [x] Personalización por usuario en `ajustes_estudio` (`src/lib/produccion/preferencias*.ts`, `/api/produccion/preferencias`, revisión optimista): orden (arrastrar o flechas), tamaño S/M/L, visibilidad, títulos, tema por sección, nombre y rol de cada agente. Los números no son editables.
- [x] Datos: `seriesPulso` y `progresoDia` en `src/lib/produccion/inicio.ts`. Pruebas `tests/pulso.test.ts`. Check 152/152, build, integración 7/7. Arnés `work/pulso-visual.mts` (no versionado) a 1440/1024/390 sin desborde, menú con foco, orden y tema persisten al recargar, movimiento reducido.
- [x] Barra superior (`259fd17`): las 7 secciones visibles en una cápsula con indicador deslizante y anillo del % del día; íconos entre 1024 y 1279 px; píldora «Menú» solo en pantallas angostas (pedido del propietario).
- [x] Fase 2 · Granjas: `src/lib/granjas/panorama.ts` + `/api/granjas/panorama`. Tarjetas por granja (horario, última ejecución, «Trabajando ahora», eventos y posts en 30 días, tokens del mes); sección oscura con mapa de puntos de El Salvador (contorno estilizado, cabeceras aproximadas, nodo por departamento con eventos vigentes), arcos animados fuentes → ezrá → Spotmi web / @spotmi.sv con etiquetas reales («MITUR → Bandeja · 57 eventos · hace 1 día»), etiquetas sin choques; flujo de agentes de la última ejecución (una granja por tipo: la de horario activo), pulso solo en pasos trabajando. Archivadas en sección propia. Pruebas `tests/panorama.test.ts`. Check 154/154, build, integración 7/7; arnés a 1440/1100/390 sin desborde.
- [ ] Fase 3: Instagram real (@spotmi.sv, insights) y calendario mes/semana/día. Fase 4: encargos en kanban y «Pregúntale a Ezra».

### 20 nov (tarde) · Barra lateral, Encargos, trazabilidad, mapa e Inicio de trabajo (pedido del propietario)
- [x] Fase 3 guardada antes (`4ce63e7`): Instagram real (solo lectura, caché 30 min), calendario mes/semana/día, lámpara de lava y capa común.
- [x] Barra lateral compartida (`shell.tsx`, `produccion/navegacion.tsx`): logo, «Nuevo encargo», 8 secciones, Perfil y ajustes abajo; 240 px expandida / 72 px contraída con tooltips; preferencia en el navegador; cajón en móvil (Escape devuelve el foco); contadores solo útiles (encargos por revisar, eventos nuevos). La sección queda en `?seccion=` y Atrás funciona. Cabecera discreta con título, ayuda y acciones (.ics en Calendario, respaldo en Conexiones); «Nuevo encargo» solo en la barra.
- [x] Encargos (`produccion/encargos.tsx`, `src/lib/produccion/resumen-encargo.ts`): lista por defecto y tablero alternativo; cada fila = título, tipo de resultado, destino, un estado resumido, etapa, «Actualizado hace» o «Previsto», acción principal. Estados separados: editorial, ejecución (del historial) y entrega por destino («Aprobado» ≠ publicado). Detalle con resultado primero, pedido, fuentes y eventos (por URL exacta, «Procedencia no registrada»), siguiente acción real (ejecutar/reintentar, enviar a revisión, aprobar con comprobaciones, pedir cambios, rechazar, descargar, fecha), destinos, ejecuciones y errores, versiones y detalles técnicos aparte.
- [x] Fallos de ejecución: nueva acción de historial «fallo» (`registrarFallo` en `generacion.ts`, llamada desde `/api/produccion/generar` tras reservar el intento); conserva el resultado y reintentar no duplica. `/api/produccion/relaciones`.
- [x] Nuevo encargo (`produccion/nuevo-encargo.tsx`): qué → con qué (eventos aprobados, fuentes, instrucciones) → dónde → opciones avanzadas (título, IA por defecto de la configuración, fecha); resumen con el costo conocido (1 de 30 intentos o tokens sin estimación). Crear no ejecuta.
- [x] Trazabilidad (`src/lib/granjas/trazabilidad.ts`, `/api/granjas/trazabilidad`): procedencia fuente → `evento_fuentes` → evento; producción evento → post (evento_id) / encargo (URL exacta) → destino (Spotmi por la propuesta, Instagram por el post, entrega del encargo). Conteos únicos + relaciones; «Sin ubicación confirmada»; filtros por departamento, fuente, estado, destino y rango con tipo de fecha explícito (evento, descubrimiento, publicación).
- [x] «Datos y conexiones» en Granjas (`granjas/trazabilidad.tsx`): Geografía en el panel oscuro de puntos con los 14 departamentos reales (geometría copiada de spotmi-web, Natural Earth, dominio público), marcadores agregados, arcos fuentes → ezrá → destinos con etiquetas reales, pulsos solo con actividad real (lecturas < 48 h, entregas hechas), zoom/desplazamiento/restablecer; Trazabilidad con nodos agrupados, línea continua = transferencia, punteada = relación, rojo = sin confirmar. Panel de detalle compartido; filtros guardados por pestaña del navegador.
- [x] Inicio de trabajo: encabezado compacto con avance de hoy (tareas) y última actualización; indicadores que abren sus registros; widgets Atención, En ejecución y bloqueados, Eventos por revisar, Contenido listo, Conexiones y actividad, Consumo de Gemini (hoy y mes, cada uno con su tope; mismo cálculo que Consumo) y gráfica. Sin «En vivo» ni animaciones de actividad falsa.
- [x] Pruebas: `tests/encargos-resumen.test.ts`, `tests/trazabilidad.test.ts`. Check 161/161. Arnés `work/ezra-visual.mts` (no versionado) a 1440 y 390.
- [ ] Integraciones ausentes: publicación automática de encargos (no existe; se descarga o copia), métricas de posts subidos a mano (no se leen por post), Facebook sin conectar, envíos a Spotmi bloqueados por la migración pendiente.

### 21 nov · YouTube conectado con métricas y encargo «Videos virales» (sin commit)

- [x] YouTube conectado con `yt-analytics.readonly` (canal Spotmi @spotmisv) y YouTube Analytics API habilitada en el proyecto de Google. La tarjeta de Conexiones ya muestra «Habilita» (faltaba `g_habilita_youtube`).
- [x] Nuevo tipo de encargo **Videos virales** (agente `virales`): tema + período (7/30/90/365 días o cualquier fecha) → `search.list` por vistas + `videos.list` → hasta 25 videos con vistas, vistas por día, interacción, me gusta, comentarios y duración. Sin IA ni intentos; ~101 unidades de las 10.000 diarias de la API. Los 20 primeros enlaces quedan como fuentes (permiten aprobar). Ranking ordenable en el detalle (`src/features/azra/produccion/virales.tsx`); la lista vive en `encargo.videos` y se vacía si se edita el pedido. Código: `src/lib/produccion/virales-{texto,youtube}.ts`, rama en `/api/produccion/generar`, origen `youtube`. En Granjas el paso `virales` se bloquea con aviso (por ahora solo desde Encargos).
- [x] Verificación: lint, tipos y 186/186 pruebas (4 nuevas en `tests/virales.test.ts`, corridas en una copia fuera de la carpeta montada). Build e integración no se corrieron. Falta la prueba real desde la interfaz.
- [x] Guardado tal cual en `d5bd7cf` (pedido del propietario, antes de la granja Clips).

### 21 nov (noche) · Granja «Clips» (commits `07faa7e`, `39fe2fa`, `660c69a`, `830befa`)

- [x] Receta destacada «Clips»: Referencias → Material → Momentos → Render de clips → Tu revisión → Destinos (YouTube, TikTok, Instagram). Código: `src/lib/granjas/clips.ts`, `clips-render.ts`, `clips-almacen.ts`, API `/api/granjas/clips`, UI `granjas/clips-revision.tsx`. Migración 12 (`medios.permiso`, tabla `clips`).
- [x] Referencias: resumen local (sin IA ni red) del encargo «Videos virales» aprobado: duración típica, títulos/ganchos, vistas por día y 5 destacados con enlace. Nunca descarga ni recorta esos videos.
- [x] Material: cada video declara su origen (propio o con permiso del autor + dónde consta). Sin un video así, la granja se bloquea.
- [x] Momentos con **Gemini viendo el video** (decisión del propietario): exige presupuesto en Consumo, estima ≈110 tokens/s (resolución baja) + 12.000 y no sube nada si no cabe hoy o este mes; tokens reales en Consumo; borra el archivo remoto. Valida 3–8 clips (inicio, fin, gancho, título) y arma subtítulos. Astra/Claude se bloquean; a mano se pega el JSON.
- [x] Render 1080×1920: video al ancho sobre fondo desenfocado, gancho (3 s) y subtítulos como PNG de next/og superpuestos con ffmpeg (el ffmpeg de Homebrew no trae libass/drawtext), dentro de zonas seguras. Cada clip es un medio con origen y permiso.
- [x] Tu revisión clip por clip: aprobar (hechos, derechos, marca) crea su pieza y aprueba esa huella; rechazar exige motivo; pedir cambios rehace solo ese clip (trabajo `clip` en la cola) como v2. Destinos: autorización existente con PUBLICAR por cuenta; no se puede autorizar antes de cerrar la revisión.
- [x] Verificación: check 199/199 (13 nuevas en `tests/clips.test.ts`, con YouTube/Gemini simulados y ffmpeg real), build aislado (2 advertencias conocidas), integración 7/7, `tsconfig.json` y `next-env.d.ts` restaurados. Arnés `work/clips-visual.mts` (no versionado): 390 y 1440 sin desborde, recorrido aprobar/rechazar/pedir cambios/v2/destinos; solo errores del Clerk sin red del arnés.
- [ ] Prueba real con un video tuyo: falta facturación en la clave de Gemini (cuota gratuita en 0) y `EZRA_PRODUCCION_IA=1`. Un video de 10 min ≈ 78.000 tokens.
- [ ] Modo oscuro del panel Clips no verificado en pantalla (el arnés emuló el sistema y la app usa su propio interruptor).
- [ ] Rehacer «Render de clips» completo borra los clips sin pieza y deja inválidas las piezas anteriores; no hay historial visible de versiones de un clip (solo en auditoría).

### 21 nov (noche) · Auditoría de la API de YouTube (Ezra `361a0fb`, `9177402`; spotmi-web `a368073`, `7dcef5d` en `feat/ezra-youtube-api`, sin push)

- [x] Ezra: «Videos virales» guarda `videosConsultados`; a los 30 días se borran videos, enlaces de YouTube, estadísticas del texto y del historial, y el resumen de Referencias de Clips (al arrancar el trabajador, cada hora y al abrir el estudio). La interfaz muestra la fecha de consulta y la de borrado.
- [x] Ezra: «Desconectar» ya revocaba en Google y borraba el token; ahora también olvida las métricas en memoria y borra id y enlace de los videos en los recibos. A Gemini (Clips) solo van cifras agregadas, sin títulos, canales ni enlaces.
- [x] Pruebas: `tests/youtube-cumplimiento.test.ts` (4) y una aserción nueva en `tests/clips.test.ts`. Check 203/203, build aislado (2 advertencias conocidas), integración 7/7, `tsconfig.json` y `next-env.d.ts` restaurados.
- [x] spotmi-web (worktree `~/dev/spotmi-web-ezra`, rama `feat/ezra-youtube-api` desde `origin/main`; `hero` y su trabajo sin commit no se tocaron): sección `#ezra-youtube` en privacidad (es/en), párrafo 20 en términos (es/en), página `/es/ezra` y `/en/ezra` (sitemap), enlaces reales en las páginas legales (`src/components/texto-legal.tsx`). Typecheck, lint y vitest de lo tocado (21/21); las 6 páginas responden 200 en `next dev` con variables de ejemplo; 390 y 1440 sin desborde. No se corrió `pnpm verificar` completo (sus pruebas de datos usan la base real y el worktree no tiene `.env.local`).
- [x] `docs/youtube-audit/`: diagramas (SVG editable + PNG 2250 px, `node docs/youtube-audit/render.mjs`), guion del video y borrador del formulario (secciones 6 y 7 sin verificar: la página se cortó).
- [ ] Propietario: revisar los textos, hacer push y abrir el PR de `feat/ezra-youtube-api`, publicar; grabar el video; completar `[COMPLETAR]` y decidir `[ELIGE]` en `form-answers.md`; enviar el formulario.
- [ ] Opcional: comprobar periódicamente si Google revocó el token (hoy, si se quita el acceso desde la cuenta de Google, el token local queda hasta pulsar «Desconectar»).
- [ ] Al mezclar `hero` con `main` habrá conflicto en `messages/*.json` (ambas ramas los cambian).

### Te toca (propietario)
- [ ] YouTube API: revisar y publicar privacidad, términos y `/es/ezra` (spotmi-web `feat/ezra-youtube-api`), grabar el video con `docs/youtube-audit/screencast-script.md` y enviar el formulario con `docs/youtube-audit/form-answers.md`.
- [ ] Clips: aprobar un encargo «Videos virales», crear la granja Clips, subir un video tuyo (o con permiso) y, cuando la clave de Gemini tenga facturación, ejecutarla. Revisar si el límite de 20 min por video y los 15–60 s por clip te sirven.
- [ ] Supabase: correr `work/supabase-probar-sin-aplicar.sql` en el SQL Editor (debe terminar en «PRUEBAS TERMINADAS»), luego `work/supabase-aplicar.sql`, luego `pnpm exec supabase login` y `pnpm exec supabase migration repair --status applied 20261103 20261117 --linked` en spotmi-web.
- [ ] Crear la cuenta editorial (Authentication → Users), habilitarla con `work/supabase-habilitar-editorial.sql` y poner `SPOTMI_EDITORIAL_EMAIL` y `SPOTMI_EDITORIAL_PASSWORD` en `.env.local`. Reiniciar `npm run dev` y pulsar Conexiones → Spotmi web → Conectar.
- [ ] `.env.local`: `EZRA_PRODUCCION_IA=1` (y `GEMINI_MODEL` si no quieres `gemini-3.5-flash-lite`).
- [ ] Consumo: escribir presupuesto diario y mensual y las tarifas de tu plan.
- [x] Granjas: dominios de ticketeras y 04:30 en «Eventos de El Salvador» (18 nov). Falta: «Post para Instagram» después de ella.
- [ ] Opcional: `bash scripts/trabajador-instalar.sh` y `sudo pmset repeat wakeorpoweron MTWRFSU 04:25:00`.
- [ ] Prueba real: `scripts/eventos-prueba-real.ts` (ver `docs/GRANJAS_CAPACIDADES.md`).
- [ ] Pendiente técnico: el publicador genérico de piezas no guarda el token renovado de Spotmi (la bandeja sí).

## 2026-10-27 · Granjas Spotmi — HECHO (salvo lo externo)

- [x] Granjas con lienzo, recetas, cola durable, personajes ligados al estado real, vista previa, autorización y recibos (ver `docs/ESTUDIO_SPOTMI.md` › Granjas, con la tabla de capacidades).
- [x] Primera prueba con datos reales: granja «Primera prueba · Noche de Catrinas (Ataco)». Ficha oficial leída, encargo v2 importado, hechos y texto en modo manual. **Detenida en «Tu revisión»**: no se aprobó ni se publicó nada.
- [x] Verificación: 82/82 pruebas unitarias, lint, tipos, compilación en `.next-verificar` y 7/7 integraciones. Navegador aislado a 1440, 390 y 360 px sin desbordamiento, incluido el recorrido completo hasta la simulación.
- [ ] Propietario: revisar y aprobar «Tu revisión»; decidir la imagen (propia o con permiso), las cuentas de destino y el texto exacto; después autorizar.
- [ ] Propietario: apps de Meta/TikTok, `EZRA_TOKEN_KEY` y las credenciales en `.env.local`; aplicar (o no) la migración de spotmi-web y habilitar la cuenta editorial.
- [ ] Spotmi web: la bandeja del equipo muestra el origen `ezra` como «analizador»; corregirlo al aplicar la migración. Quitar el «San Miguel» repetido en la lista de departamentos.

## 2026-10-07 · Navegación más fluida (solo interacción) — HECHO

- [x] Capa `src/features/azra/motion.css` (cargada después de `azra.css`): estados normal/hover/activo/presionado/foco/deshabilitado en menú, submenú del bot, herramientas de contenido y lateral del chat; halo lila/violeta del acceso «Pregúntale a la IA» (barra superior) al pasar el cursor o con foco de teclado; transición de la barra lateral al contraer/expandir con íconos fijos y etiquetas que aparecen sin cortarse; tooltips propios en modo compacto; cajón móvil y fondo atenuado; diálogos que aparecen y se cierran suavemente; entrada breve del contenido al cambiar de vista; botones, campos, pestañas y tarjetas clicables con transiciones.
- [x] Sin funciones, rutas, opciones ni textos nuevos. Cambios de marcado mínimos: `title` → `data-tooltip` solo en modo compacto (`shell.tsx`), import en `src/app/azra/layout.tsx`, envoltorio `az-view` con `key` en las secciones del bot.
- [x] Evidencia: `work/azra-validation/motion/` (`navegacion-fluida.mp4/.gif`, `halo-ia.png`, `tooltip-compacto.png`, `hover-y-activo.png`).
- [ ] El video de referencia no llegó adjunto; se siguió la especificación escrita. Ajustar duraciones si el propietario lo pide tras verlo.

## 2026-10-07 · «Spotmi» y formulario de Empresa — HECHO

- [x] `owner-main` «Mi negocio» → «Spotmi» (registro y marca del workspace; copia en `work/backup-rename-spotmi-20261007-193054/`). Histórico `spotmi` intacto.
- [x] Empresa: audiencia y objetivo separados, 17 categorías, nichos dependientes, «Otro» con detalle, uso personal, validación y compatibilidad con registros viejos.
- [ ] Empresa sigue en almacenamiento local del navegador (demo); pasar al servidor cuando se defina el backend de cuenta.

## 2026-10-07 · Bot de atención (etapa local) — HECHO

- [x] Menú principal: «Bot de atención» bajo Creación de contenido; submenú de 7 secciones + Conexiones.
- [x] Configuración, conocimiento, reglas, conversaciones de prueba y actividad persistentes por negocio (`bot.json`, API `/api/bot`, revisión optimista, respaldo).
- [x] Simulador determinista «Prueba local: no envía mensajes»; control humano detiene respuestas.
- [x] Conexiones compartidas con Creación de contenido: todo «Sin conectar».
- [ ] Verificar MCP/API/webhooks de GHL y diseñar el adaptador real (ver `docs/features/bot-de-atencion.md`).
- [ ] Traducción EN del módulo; revisión visual del propietario.
- [ ] Confirmación del propietario para borrar el acceso `(correo del cliente Sgmotos; ver data/access.json)` (Sgmotos).

## 2026-10-07 · Herramientas de contenido: Conexiones

- A petición del propietario, el lateral de Creación de contenido ahora contiene solo «Conexiones». Nuevo chat, Buscar, Plantillas y Personalizar se retiran de esta pantalla; el apartado de IA no cambia.
- Conexiones abre un diálogo para el futuro MCP de GHL, explícitamente pendiente de configurar. No se agregan credenciales, llamadas externas ni conexiones simuladas. Se conserva la creación de paneles locales y todo el contenido guardado.
- Verificación: check, build y 6 integraciones correctos; navegador aislado confirma menú con solo Conexiones, apertura del diálogo y cierre con Escape.
- Próximo paso: especificar la integración real de GHL y verificar sus capacidades antes de activarla.

## 2026-10-07 · Creación de contenido según capturas del propietario

- Nueva pantalla real `/azra/content` para administración y clientes, integrada en `AzraShell`; Ask AI y el login existentes se conservan. Implementación: `src/features/azra/content.tsx` y `content.css`.
- Inicio sin paneles ni conexiones. `socialPanels` opcional en el workspace (Facebook/Instagram, únicos, máximo dos); guardado por API con aislamiento y revisión optimista. Quitar un panel conserva publicaciones y medios. Contenido demo oculto, nunca borrado.
- Diseño blanco/lila con herramientas, pestañas, tarjetas seleccionables, búsqueda, tres estructuras de texto y personalización de voz/criterios. Editor local con medios propios, fuentes existentes, revisión y exportación ZIP manual usando APIs y reglas editoriales existentes. Cambio de marca invalida aprobaciones según la lógica del servidor.
- Métricas sin datos, conexiones sin activar y orden por rendimiento deshabilitado. Una cuenta por red y negocio en esta fase. No existe OAuth ni importación/publicación social; no se activó gasto.
- Limitaciones pendientes: alta/revisión de fuentes desde la nueva interfaz (el editor selecciona fuentes existentes), vista previa específica por formato, gestión de múltiples cuentas de una misma red y traducción de esta nueva pantalla a inglés. Notificaciones/ayuda globales conservan su disponibilidad anterior. No se restauró el estudio retirado.
- Validación: `npm run check` (55 pruebas), `npm run build`, `npm run test:integration` (6 pruebas) correctos. Prueba nueva de paneles, preservación de datos y conflictos; ruta de contenido accesible por cliente autorizado. Navegador con fixture aislado en `work/`, API real: panel vacío, creación/persistencia de borrador, revisión y aprobación bloqueada sin fuente/comprobaciones, exportación solicitada, Escape y foco visible. Escritorio 1440 y móvil 390 sin desbordamiento del documento. No se probó sesión Clerk real.
- Arnés temporal `work/content-preview-server.mts`, puertos loopback 3127/3128; captura `work/content-design/desktop.png`. No contiene datos reales y no sustituye la aplicación de 3000.
- Próximo paso: revisión visual del propietario en `/azra/content`; completar alta de fuentes y vista previa antes de ampliar integraciones.

## Ask AI con Gemini (2026-10-07) — HECHO

- [x] `POST /api/ask` con `@google/genai`, clave solo en servidor (`GEMINI_API_KEY`, `GEMINI_MODEL`, por defecto `gemini-3.5-flash-lite`).
- [x] Herramientas de solo lectura: programadas, por estado, por plataforma; métricas y mensajes → «no conectado».
- [x] Instrucción de sistema en español; límites de largo y 5 preguntas/min por cuenta.
- [x] Chat activo con historial, carga y errores en español; «Integración pendiente» eliminado.
- [ ] Propietario: agregar `GEMINI_API_KEY` en `.env.local`, reiniciar y probar con su cuenta.
- [ ] Futuro: fuentes reales de métricas y mensajes (Meta/GHL); consultas al catálogo verificado si se pide.

## Relevo prioritario — panel por empresa (2026-10-07)

Relevo «claudeya» solicitado. Leer primero el bloque prioritario de `CLAUDE.md`; los apartados inferiores conservan el historial. Aplicación real en 3000; vista de prueba aislada en 3118, no confundir con datos reales. Rama `feat/migracion-ezra`, cambios sin commit conservados.

- Pedido vigente: Sgmotos debe usar el diseño nuevo de administración, conservando datos/permisos propios. Implementado compartiendo `AzraShell`; no dar rol admin a clientes ni dirigirlos a ajustes de agencia.
- Archivos clave: `src/components/studio.tsx` (shell nuevo por defecto, panel anterior retenido con `legacyPanel=false`), `src/features/azra/shell.tsx` (opciones de negocio), `business-overview.tsx` (inicio real), `azra.css`, mensajes ES/EN. Las APIs y autenticación conservan el aislamiento existente. Todos los negocios que usan Studio reciben la estructura nueva.
- La ruta sigue `/` / `?business=…&view=…`; `/azra` es solo administración. No activar el panel anterior mediante parámetros de URL. El código previo sigue disponible, no se borraron datos.
- Validación: check (59 unitarias), build y 6 integraciones. Integración ampliada para verificar que Sgmotos no puede consultar/exportar motoxspress ni administrar usuarios. API oculta negocios ajenos con 404.
- Verificación visual con el componente real Studio y API real en un entorno aislado `work/business-shell-*`: escritorio 1440×900, móvil 390×844; navegación, Escape, borrador guardado y persistente tras recargar, paso a revisión y aprobación bloqueada sin comprobaciones. Agenda móvil sin desbordamiento. Fixture de Clerk offline, no prueba de inicio de sesión real. Herramienta temporal `work/business-preview-server.mts` (no versionada), nunca usa datos reales.
- Pendiente: revisión del propietario con su sesión real; completar traducción de pantallas heredadas (negocios siguen en español; no se ofrece traductor allí); conexiones GHL y funciones del foro en fases posteriores. Se conservaron cambios ajenos ya presentes, no hay commit nuevo.
- Comando del propietario: cuando diga «Claudeya», actualizar este archivo y TASKS con todo el contexto útil, pruebas/pendientes y siguiente paso. Regla persistida en AGENTS.md.
- Próximo paso: revisar la apariencia con el propietario; después especificar una función del foro por vez, empezando por plantillas de marca y datos verificados. No activar APIs ni gasto por leer este relevo.

Actualizado: 7 de octubre de 2026.

## Current design handoff — 2026-10-06

- The owner requested an implementation-ready Spotmi design for information collection, creative generation, and automatic incoming-message replies. Current authorization is design and local simulation only.
- Proposal and phased implementation/budget specification: `docs/design/spotmi/README.md`.
- Standalone React/TypeScript prototype: `docs/design/spotmi/prototype.tsx` and `prototype.css`. Start with `node scripts/preview-spotmi-design.mjs`, then open `http://127.0.0.1:4177`.
- The prototype uses sample data and an independent browser-storage key. No production data, account configuration, credentials, sources, or automation were changed.
- Next implementation work should start with typed domain contracts and local simulation, followed by one verified source, one template, and one eligible messaging channel. Do not activate services by reading this handoff.
- Exact Meta scopes/onboarding, real account eligibility, bot FAQs, source permissions, rendering quotas, hosting/storage, and the n8n license fit for client configuration remain unresolved as described in the proposal.
- Pre-existing edits in `src/components/studio.tsx`, `src/styles/studio.css`, and `next-env.d.ts` belong to earlier work and were not overwritten.
- Validation evidence and desktop/mobile screenshots are recorded in `docs/design/spotmi/VALIDATION.md`.
- Owner feedback: most of the visual design needs reconsideration. Sidebar height/accessibility corrected; next design iteration should follow the owner's choices after the 8-screen explanation, especially compact layout and separate panel/template/knowledge controls.

## Alcance actual

- El producto activo es el panel comercial para Sgmotos y motoxspress, más un panel del propietario.
- El acceso usa una sola pantalla de correo y contraseña. El propietario administra los accesos de los clientes desde Mi panel; cada correo abre únicamente su organización.
- Spotmi no forma parte del flujo de trabajo. Sus datos y automatizaciones anteriores se conservan como archivo local para no perder información.
- Clerk ya está configurado en desarrollo en la aplicación indicada en `docs/CLERK_MIGRATION.md`; existen tres cuentas de prueba y el primer acceso enlaza cada identidad con su panel.

## Completado

- Piloto local con seis pantallas y diseño adaptable.
- Persistencia, biblioteca de medios, fuentes, revisión editorial e historial.
- Calendario de fechas previstas, exportación y respaldo.
- Revisión independiente por Claude Code y corrección de cinco hallazgos.
- Análisis estático, tipos, 15 pruebas de dominio/persistencia, compilación y prueba HTTP de integración aprobados.
- Documentación común para Codex, Claude y Gemini.
- Migración de autenticación a Clerk completada: una pantalla de acceso, autorización privada por panel, aislamiento de negocios y rutas locales antiguas retiradas.
- Lado de ezrá para la prueba simulada de n8n: `data/automation.json`, `POST /api/automation/jobs` y `POST /api/automation/results`, con secretos separados en `.env.local`. Probado con un receptor falso local (ida y vuelta, receptor apagado, secretos incorrectos o ausentes, resultado repetido y reinicio). Ver DECISIONS.

## Relevo a Claude

El usuario pidió continuar el trabajo con Claude. El contexto ejecutable está en `docs/CLAUDE_HANDOFF.md`; Claude debe trabajar en esta misma carpeta, revisar los documentos compartidos y modificar una cosa a la vez.

## Enfoque actual (5 de octubre)

Terminar el panel de Sgmotos antes que el de motoxspress. Hecho: asistente de 4 pasos catálogo → variante y fotos → promoción → redes → revisión, y diálogos a pantalla completa en móvil (ver DECISIONS). Pendiente: que el propietario pruebe los tres accesos Clerk, cargue productos reales de Sgmotos y revise el asistente en el teléfono; después, la conexión oficial de las redes de Sgmotos (etapa 3), empezando por una cuenta de prueba. Añadido también: año, cilindrada, especificaciones y financiamiento aprobado en el producto, y «Preparación para conectar redes» en Ajustes. Accesos comprobados: administración y Sgmotos; falta motoxspress.

## Siguiente hito

1. Completar una pasada visual de calendario, biblioteca, ajustes y móvil. Los detalles de lo ya probado están en `docs/VALIDATION.md`.
2. Probar los tres accesos Clerk y confirmar aislamiento: administración ve los tres paneles; cada cliente ve solo el suyo.
3. Mejorar los problemas observados sin introducir servicios facturados.
4. n8n local instalado y prueba simulada de ida y vuelta verificada (ver DECISIONS). Cuenta local de n8n creada, copia de `~/.n8n` en `Documentos/Respaldos-ezra/` y botón «Probar conexión con n8n» en Ajustes (`GET /api/automation/jobs` devuelve el estado sin secretos). Pendiente: revisión visual del botón por el usuario, porque el navegador automatizado no pasa la protección de origen.
5. Metricool Free evaluado (ver `docs/METRICOOL.md`). Siguiente: primera publicación real programada **a mano** en Metricool desde una versión aprobada en ezrá, registrando después el enlace real. Exportación lista para esto: `texto.txt` con solo el texto, aviso JPEG para Instagram y advertencia/nombre `-no-aprobada` si la versión no está aprobada. Aprobar y publicar los hace el propietario.
6. Eventos para spotmi-web (ver DECISIONS, 2026-10-04): camino (a) «Exportar para el sitio» disponible. Camino (b), endpoint en el sitio, pendiente del visto bueno del administrador del sitio y de corregir allí el hallazgo de `is_verified`. Por confirmar: quién administra Supabase/Vercel, el dominio y si las «fotos» son portadas de eventos o galería de la ficha.
7. Fase A de ideas (ver DECISIONS): tipos de fuente, «Buscar ideas» y lista de ideas en Fuentes, flujo `docs/n8n/ezra-buscar-ideas.json`. Probado con receptor falso y con el lector sin internet. Pendiente: añadir `N8N_IDEAS_WEBHOOK_URL` a `.env.local`, importar el flujo en n8n y que el propietario lo pruebe con una fuente RSS real. Fase B (texto con Gemini) implementada y probada con un n8n falso (ver DECISIONS); pendiente: `N8N_DRAFT_WEBHOOK_URL` en `.env.local`, importar `docs/n8n/ezra-generar-propuesta.json`, credencial de Gemini creada por el propietario y una primera prueba real. Fase C (imagen) sin empezar.
8. Antes de integrar Meta, WhatsApp o Gemini, verificar requisitos oficiales actuales y decidir una prueba acotada.

No activar API, despliegue ni publicación externa por leer esta lista. Los USD 20 adicionales siguen disponibles. La carpeta `data/` es privada y no se versiona.

## Ahora (2026-10-07, noche)

- Hecho: login arcade EZRA sobre el login existente (Clerk intacto). Pendiente: que el propietario lo pruebe e inicie sesión con su cuenta.

- Hecho: un solo panel para todas las cuentas; estudio de negocios eliminado del código (respaldo `0767994`); clientes con Ask AI + Mi perfil; selector = negocio activo. 54/54, build, 6/6.
- Pendiente del propietario: probar con su cuenta y con un cliente real; decidir si también se borran las APIs del estudio.

- Hecho: menú de administración reducido a «Pregúntale a la IA», inicio y login redirigen ahí; tablero y Prospección eliminados. Siguiente: Ask AI real (elegir proveedor y costo, dentro del techo de USD 20).

- Hecho: nuevo diseño de inicio de sesión y registro según referencia del propietario. Falta su revisión con su cuenta real (iniciar sesión de punta a punta).

## Ahora (2026-10-07, tarde)

- Hecho: revisión visual de Sgmotos y motoxspress (escritorio y móvil) y correcciones de texto, legibilidad, buscadores y cabecera móvil. Aislamiento verificado. 59/59, build, 6/6.
- Preparado: `docs/features/plantillas-de-marca.md`.
- Espera al propietario: 5 decisiones de plantillas; voz «tú» vs voseo en el panel de negocios; mostrar o no «Presupuesto del piloto» a clientes; uso de los colores de Apariencia.
- Siguiente: implementar la fase local de plantillas tras esas respuestas. Integración GHL solo tras lectura de prueba autorizada de Brand Boards.

## Relevo actual — Azra Stage 1 (2026-10-07)

- Hecho: base aislada `/azra`, manifiesto de 40 referencias, navegación, ES/EN y componentes de modal/formulario/estados; agencia/chat base con placeholders explícitos.
- Hecho: crear credencial demo, seleccionar/editar permisos, copiar token ficticio, rotar siete días, cancelar, expirar anterior, revocar token/integración, persistencia y errores. Proveedor Azra/HighLevel pendiente sin bloquear UI.
- Verificado: 46 unitarias, build y 5 integraciones del piloto; navegador creación/rotación/cancelación/edición/expiración/revocación persistente, móvil 390 px y escritorio 1440 px, idioma y Escape.
- Hecho Stage 2 (2026-10-06): perfil general #6 y usuarios #9 funcionales demo; seguridad #7 UI completa sin backend (nunca simula éxito); empresa #8 datos básicos funcionales demo (pestañas restantes fuera de alcance). `AccountService` + demo vacío + 4 pruebas nuevas. Sidebar global sin las 8 secciones que el propietario no agregará.
- Hecho (2026-10-06): tablero de la agencia y shell según capturas nuevas del propietario (GHL en español): terminología, insignias, cabecera con botón de traducir, selector de subcuentas anclado con crear → plantillas de instantánea → subcuenta demo. 52 unitarias, build e integración correctos.
- Hecho (2026-10-06): prospección #38/#3/#5/#4/#39 con `ProspectingService` demo; 55 unitarias, build e integración correctos; headless 1440/900/390 sin desbordamiento.
- Hecho: sin «Nueva» en menú global; premium eliminado en prospección (mapas de calor editables). 56 unitarias.
- Pendiente del propietario: video de las funciones a agregar (guardar en Escritorio; la ruta temporal no es legible).
- Hecho (video del propietario): flujos #10 + por subcuenta, 2FA, Empresa completa (marca blanca, avanzada, SSO, dirección, funciones) y Avisos #20. 59 unitarias, build e integración correctos.
- Hecho fase 1 de migración (2026-10-07): marca/paleta ezrá, login Clerk protegiendo `/azra`, negocios reales como subcuentas; prueba de integración nueva (6/6).
- Siguiente fase de migración: `/` admin → tablero nuevo; accesos de clientes → Usuarios; estudio dentro del shell; rutas a la raíz.
- (Original) migración pedida por el propietario (marca ezrá + paleta del piloto sobre la estructura nueva, conservar login/sesiones/protección).
- Antes previsto: workflows #10, teléfono #11 y correo #12–#17; extraer tabla/filtros/paginación de `account/users.tsx` cuando se reutilicen. Las rutas existentes con aviso NO cuentan como pantallas implementadas.
- Relevo obligatorio y siempre actualizado: `CLAUDE.md`. Inventario/mapa/pendientes por pantalla: `docs/design/azra/INVENTORY.md`.
- Pendientes externos: proveedor y catálogo completo de permisos; assets/fuente/datos y contratos de otros servicios. No bloquear avances demo por esas decisiones. No desplegar ni activar gastos.

## 2026-10-27 · Dirección vigente: Estudio Spotmi

El propietario confirmó que el centro de producción vive en Ezra y se conecta a Spotmi; Astra es el modelo de Codex. Se añade /azra/produccion para administración, con 11 especialidades, encargos persistentes, cadena por versiones, revisión, calendario y exportación. Los otros negocios conservan sus datos y permisos.

El propietario pidió desvincular Metricool y HighLevel: no reintroducirlos como dependencia del producto. El plugin Metricool se desvinculó de Codex; GoHighLevel no estaba instalado. En el código solo había un contrato futuro de GHL: se sustituyó por estados de conexión directa. No se revocaron accesos sociales en Meta ni se cancelaron suscripciones.

La lectura de Spotmi usa sus fichas públicas y la clave anónima, nunca service role. Dominio confirmado: https://spotmi.com.sv. Los adaptadores locales de Codex y Claude usan la sesión del propietario, con comandos/archivos/plugins desactivados y búsqueda pública solo para el cazador. No activar una API facturada automáticamente. Gemini sigue detrás de configuración explícita. Toda entrega vuelve a revisión; no se publica en redes desde esta versión.

Guía vigente y límites: docs/ESTUDIO_SPOTMI.md. La documentación anterior conserva el historial; las decisiones de este apartado prevalecen para el nuevo estudio.

## 2026-10-27 · Interfaz anterior deshabilitada

El propietario pidió una sola interfaz. Se retiraron del catálogo y del bundle visible Chat, Contenido, Bot y Configuración anteriores. Sus URLs redirigen a /azra/produccion para todas las cuentas, incluidos los clientes. El marco anterior (sidebar blanco/lila y sus hojas azra.css/motion.css) dejó de importarse; se utiliza únicamente el marco del Estudio Spotmi. Las cuentas de cliente ven el nuevo diseño en modo de vista sin llamadas a las APIs privadas, sin encargos de administración y sin nuevas autorizaciones. Crear, editar y ejecutar sigue protegido por requireAdmin en el servidor. La información y las APIs del piloto se conservan, pero su interfaz anterior no se monta.

El acceso también usa el estilo oscuro del Estudio Spotmi. La presentación arcade, los estilos globales heredados y las pantallas anteriores ya no se importan. Clerk conserva sus flujos y permisos.


## 2026-10-27 · Solicitud siguiente: Granjas y conexiones directas

Pendiente de implementación por Claude, según `CLAUDE_GRANJAS_SPOTMI.md`: renombrar Producción a Granjas; editor persistente de agentes y conexiones; personajes animados según trabajo real; ejecución configurable y reanudable; medios/video reales; tarjetas OAuth separadas de Instagram, Facebook, TikTok y Spotmi web; autorización del envío ligada a una versión y destinos concretos. No se han agregado estas funciones en esta sesión.

Se auditó el estado: datos en `data/produccion-spotmi.json`, backend local Next.js; sin publicador social ni escritura a Spotmi. Lectura real de Spotmi comprobada el 27/10/2026: 25 eventos, 37 spots, 37 fichas con imagen. No se transfieren autorizaciones antiguas de Metricool.

El propietario eligió el encargo `ae58cf22-6697-497a-8b95-5a26cc2c3f41` para la primera prueba. Se guardó investigación parcial manual y un borrador, versión 2, en revisión, con las comprobaciones sin aprobar. La ficha de El Salvador Travel enlaza a Instagram, pero el anuncio original no pudo leerse. Fecha/año del original, imagen y derechos quedan pendientes. No se ejecutó un adaptador ni se publicó nada. Ver `docs/relevos/granjas-spotmi-20261027/PRIMERA_PUBLICACION.md`.

La API de Direct Post de TikTok tiene restricciones de elegibilidad para herramientas internas. Claude debe verificar la vía permitida y no prometer publicación directa sin aprobación de plataforma. Preparar una vista previa no autoriza enviarla: la primera publicación real requiere autorización final de la versión y las cuentas concretas.


## Cierre verificado · Granjas · 27 de octubre de 2026

La interfaz de Granjas está integrada en el estudio: recetas, lienzo de agentes, conexiones entre pasos, inspector, encargos vinculados, ejecución manual, revisión y vista previa. Se conserva el código reciente del otro editor; no se sobrescribió el backend de Claude ni la integración concurrente. Conexiones incluye Instagram, Facebook, TikTok y Spotmi, con requisitos y estados reales; una tarjeta visible no acredita una cuenta conectada.

Verificación final de la versión integrada en copia aislada: `npm run check` pasó (lint, TypeScript y 82 pruebas); build con Webpack y `EZRA_DIST_DIR=.next-verificar` pasó; integración HTTP pasó 7/7, incluidas autenticación, roles y Granjas. Navegador a 1440 px: lienzo e inspector visibles; Alt+flecha y Guardar comprobados. A 390 y 360 px, ancho de documento igual al viewport y sin claves g_* visibles. La regla CSS de movimiento reducido se revisó; no se emuló la preferencia del sistema. La build temporal y los servidores de QA se retiran al cerrar.

La comprobación local adicional del encargo `ae58cf22-6697-497a-8b95-5a26cc2c3f41` creó la granja `baa6585d-ee21-4ccf-be0b-67532e722216` («Primera prueba · Instagram»), ejecución `6d697f57-e00f-40a7-9699-0e85eae7d6ec` y pieza `f4470a71-bd41-450c-84d6-808ba36c9cd8`. Se leyó la ficha oficial (HTTP 200), se importó el encargo y se preparó el texto manualmente. Estado: esperando al dueño, 0 autorizaciones y 0 recibos. No se ejecutó IA, no se subieron medios y no se publicó. Informe: `work/primera-prueba-granjas-real.json`. La granja preparada antes por Claude se conserva también; no se borraron datos.

Los registros de la app viven en `data/granjas/granjas.sqlite`; medios en `data/granjas/medios`; encargos previos en `data/produccion-spotmi.json`. No es almacenamiento remoto ni una subida a Spotmi. La migración y sus ataques están preparados en spotmi-web (`20261103_propuestas_ezra.sql` y `supabase/tests/propuestas_ezra.sql`), SIN aplicar ni ejecutar; falta validarlos en una base aislada. No se regeneraron tipos de una migración sin aplicar.

Pendiente externo: conectar y comprobar cuentas reales y permisos, contrastar el anuncio original de Instagram, aportar imagen autorizada si el canal la exige, y aprobación explícita del contenido exacto y de cada cuenta. TikTok queda en envío de borrador y exige video. Spotmi exige migración aplicada y cuenta editorial habilitada. Gemini y servicios de pago no se activaron; no hubo push, merge ni despliegue.

Matriz de capacidades y uso: `docs/GRANJAS_CAPACIDADES.md`. Contenido exacto: `docs/relevos/granjas-spotmi-20261027/PRIMERA_PUBLICACION.md`. El siguiente paso del propietario es revisar ese texto y elegir cuentas; ninguna aprobación documental sustituye la autorización por versión y destinos en la app.


## 2026-10-27 · Prueba de conexión con n8n Cloud

Se añade scripts/probar-n8n.mjs para probar únicamente accion=probar_conexion con el webhook autenticado de spotmi.app.n8n.cloud. Configuración privada en .env.n8n.local, excluida por .gitignore. No cambia el trabajador ni publica, programa o envía contenido editorial. Valida la respuesta y el id de solicitud, limita el destino HTTPS y rechaza redirecciones. Ejecución: node --env-file=.env.n8n.local scripts/probar-n8n.mjs. Tres pruebas con respuestas simuladas pasaron; la prueba real sigue pendiente de configurar el secreto y activar la escucha en n8n.


## 2026-10-27 · Integración de Granjas con n8n Cloud

Se añade tarjeta n8n en Conexiones, prueba autenticada desde administración y descarga del flujo docs/n8n/ezra-meta.json. El publicador existente conserva aprobación por hash, autorización por cuenta y recibos; con EZRA_N8N_PUBLICACION=1 sus llamadas publicar/confirmar de Facebook/Instagram pasan por n8n, sin reintentos automáticos. El flujo limita destinos Meta, acepta bytes/formularios hasta 8 MB y no persiste ejecuciones. OAuth continúa en Ezra con regreso HTTPS opcional por n8n al callback fijo local y state de sesión. .env.meta.local se carga al arrancar.

Pruebas: lint/TypeScript y 88 pruebas locales, compilación aislada; la prueba real previa solo confirmó la conexión de prueba. Pendiente importar/publicar el nuevo flujo, completar claves de Meta de forma privada, autorizar cuentas y probar publicación con versión/destinos autorizados. No se publicó, no hubo despliegue ni cambio en la base de Spotmi. Límites y pasos: docs/N8N_META.md.

Validación adicional: integración HTTP aislada de Granjas pasó con fixture local de Clerk (incluye denegación sin sesión, lectura de estado sin secreto, descarga del flujo y rechazo de acción publicar en el endpoint de prueba). La revisión visual automatizada quedó pendiente: el navegador no permitió completar la navegación. El video del propietario muestra la app Meta Ezra con dos casos de anuncios y Facebook Login; no muestra Instagram configurado. Próximo paso externo: abrir Agregar casos de uso y habilitar publicación de Instagram/Páginas según opciones disponibles.

## 2026-10-28 · n8n de producción verificado; falta la app de Meta

- [x] Flujo «Ezra — Meta y conexión» publicado en n8n Cloud: `probar_conexion` con clave → 200 y respuesta correcta; sin clave → 403; `ezra-oauth-facebook` y `ezra-oauth-instagram` activos (sin state redirigen a Conexiones). No se publicó nada.
- [x] `EZRA_TOKEN_KEY` generada en `.env.meta.local` (no había conexiones guardadas). No cambiarla después de conectar cuentas.
- [ ] Propietario: en Meta, agregar casos de uso de Instagram (API con inicio de sesión de Instagram) y de Páginas; registrar las dos URI de retorno de n8n; copiar App ID/secreto de Meta y de Instagram en `.env.meta.local`; reiniciar `npm run dev`; conectar desde Conexiones en 127.0.0.1:3000.
- [ ] Después de verificar ambas cuentas: `EZRA_N8N_PUBLICACION=1` en `.env.n8n.local` y una primera publicación solo con versión y destinos autorizados.


## 2026-11-18 · Catálogo editorial integrado en Ezra
Por solicitud del propietario, Codex integró las tarjetas 3:2 y la pestaña Vista previa Spotmi desde la copia aislada. Se conservaron los archivos en curso de Claude (inicio, onboarding, encargos y backend de producción). Vista local con búsqueda, filtros, eventos aprobados vigentes y enlaces a fuentes. Imágenes públicas de la vista previa solo con confirmación y permiso; referencias IA excluidas. No se modifica el sitio público ni data/. Validación previa aislada: 129 pruebas y build; verificación conjunta en curso.

Verificación conjunta al integrar: 129/129 pruebas unitarias; compilación Webpack de instantánea combinada en copia aislada correcta. Lint del módulo de eventos correcto. Lint global detectó cinco símbolos sin usar en estudio.tsx mientras Claude lo modifica; se preservó su trabajo. Integración HTTP y revisión en navegador siguen pendientes por las limitaciones del entorno documentadas anteriormente.


## 2026-11-18 · Referencia manual de Gemini desde tarjetas
Se añadió «Preparar referencia para Gemini» a tarjetas sin medio o con referencia IA. Usa referencia_prompt existente, adapta la composición manual a 3:2 y ofrece copiar, abrir Gemini y subir JPEG/PNG/WebP mediante el flujo existente referencia_subida. No llama a generación facturada ni cambia la política de publicación: referencia IA solo en bandeja, nunca fotografía oficial ni portada pública. La interfaz aclara que falta de imagen en Ezra no prueba ausencia en todas las fuentes. Lint del archivo, TypeScript y 10 pruebas de eventos/catálogo pasan; pendiente revisión manual en navegador y generación real en la app de Gemini. No se modifican archivos de inicio/onboarding de Claude.

## 2026-11-19 · Estudio funcional, rediseño e imagen original
- [x] Estudio: Inicio con siguiente paso, guía de inicio con pasos obligatorios u opcionales, encargos con historial, revisión (aprobar, solicitar cambios, rechazar), calendario por tipo de fecha y .ics, conexiones con «qué habilita» (`1f10445`, `19239dd`).
- [x] Trabajo pendiente de Codex (catálogo editorial y referencia manual de Gemini) guardado en su propio commit (`94ab703`) a pedido del propietario.
- [x] Imagen original de Instagram/Facebook: «Buscar imagen original», vincular el enlace, carrusel y video por API cuando hay acceso, captura con recorte cuando no, comprobaciones del evento, referencia interna con permiso pendiente, invalidación de posts. Pruebas en `tests/imagen-original.test.ts`; arnés `work/imagen-original-visual.mts` a 1440 y 390.
- [ ] Propietario: para recuperar automáticamente de cuentas de terceros (como @bolsadevaloressv), conectar Facebook con los permisos de Business Discovery (ver Conexiones › Facebook › guía). Mientras tanto: captura con recorte.
- [ ] Confirmar con una llamada real que `/me/media` responde con el token de Instagram (inicio de sesión de Instagram); la documentación de Meta no lo dice explícitamente.
- [x] Rediseño claro (19 nov): paleta por variables, cabecera con menú de cuenta, barra lateral con selección tenue y menú desplegable en móvil, Inicio con pendientes como sección principal, una acción principal por pantalla, detalles técnicos plegados. Capturas en `output/rediseno-claro-2026-11-19/` (1440 y 390). Check 139/139, build, integración 7/7; recorridos con clics en `work/estudio-visual.mts`, `work/imagen-original-visual.mts` y `work/estudio-auditoria.mts`.
- [ ] Pendiente visual: el lienzo de Granjas conserva su estructura (solo cambió de color); el pie «spotmi · creative studio» podría retirarse; los textos de ayuda de Granjas y Eventos (de otras sesiones) siguen largos.
- [ ] La referencia visual adjunta no llegó: si el propietario la comparte, ajustar contra ella.

### 2026-11-20 · Inicio, fuentes y apariencia
Mapa trasladado desde Granjas a Inicio con filtros plegables, directorio de fuentes por granja y recorrido de fuentes en grupos de cinco. Verificados el alta de un enlace en datos aislados, el mapa y la persistencia del modo oscuro a 390 y 1440 px. Pasaron lint, tipos, 161 pruebas unitarias, compilación aislada y 7 integraciones.

Mapa integrado al ancho del tablero de Inicio. Los indicadores preceden a la visualización y los filtros y las fuentes quedan debajo.
Paleta del mapa actualizada en ambos temas del estudio.
Inicio mantiene el mapa a todo lo ancho con la paleta anterior y fondos neutros por tema.

### 2026-11-20 (noche) · Mapa protagonista en Inicio
- [x] Mapa de procedencia en `src/features/azra/granjas/mapa-procedencia.tsx` (+ `.css`), Inicio reordenado, sol y luna, barra plegable en su borde, migración de «líquido» a claro, filtro de fechas por día local. Check 161/161; build e integración 7/7 en una copia limpia con Next 16.3.8. Arnés `work/mapa-inicio-visual.mts` (no versionado) con copia de los datos reales a 1440, 1024, 390 y 360 px: sin desborde, sin etiquetas superpuestas, líneas unidas tras plegar, selección conservada al cambiar tema y ancho, tema y barra recordados al recargar.
- [ ] El propietario instaló `next@16.5.0-canary.57` con pnpm (22:25): con esa versión el servidor de desarrollo no acepta la sesión de prueba (401) y aparecieron `pnpm-lock.yaml` y `pnpm-workspace.yaml` junto al `package-lock.json`. Decidir: volver a npm con Next 16.4.6 estable o seguir con pnpm (y actualizar Dockerfile y README).
- [x] Mapa de Inicio v2 (país protagonista, lateral único, rutas al elegir, carga sin saltos). Check 161/161; build e integración 7/7 en la copia limpia con Next 16.3.8. Arnés `work/mapa-inicio-v2.mts` (no versionado): primera carga con datos demorados 1,8 s (país visible, 0 px de salto), paso rápido del cursor, clics rápidos, Eventos ↔ Contenidos (0 px), lateral con 12 fuentes y 4 destinos simulados solo en la prueba, movimiento reducido, oscuro, barra plegada (13/13 rutas unidas), 390 y 360 px sin desborde.
- [x] (21 nov) Mapa con ezrá al centro, controles debajo, carga por partes con líneas fantasma; Codex y Claude Code locales con diagnóstico real. Check 165/165 (4 nuevas en `tests/ia-local.test.ts`); build e integración 7/7 en la copia limpia (Next 16.3.8). Comprobación real en esta Mac: Codex 0.162.1 y Claude Code 2.1.330 con sesión, todas las restricciones aceptadas; una prueba real de respuesta cada uno («OK»: 6,0 s y 2,3 s). Arneses `work/mapa-inicio-v2.mts` y `work/ia-local-visual.mts` (no versionados).
- [ ] Revisar el video de carga del propietario cuando lo guarde fuera de la carpeta temporal de macOS (Escritorio o Descargas).
- [ ] Decidir Next: volver a npm con 16.4.6 estable o seguir con el canary de pnpm.
- [x] (21 nov, madrugada) Docker probado con Colima; Next 16.4.6 con npm; YouTube y puente de TikTok; guía `docs/CONECTAR_REDES.md`; Eventos en lista compacta con detalle legible. Check 171/171; integración 7/7 en el contenedor. Arnés `work/eventos-mirar.mts` (no versionado): búsqueda, menú con teclado, detalle, 1440 y 390 sin desborde ni errores.
- [ ] Propietario: abrir el pull request https://github.com/rafa-sg/ezra/pull/new/feat/eventos-instagram y unirlo a main cuando quiera; invitar colaboradores (Settings → Collaborators).
- [ ] Propietario: conectar Facebook, TikTok y YouTube siguiendo `docs/CONECTAR_REDES.md`; verificar Instagram entre el 22 y el 28 de diciembre.
- [ ] Propietario: decidir si se reescribe el historial de GitHub para quitar el correo de las ramas antiguas.
- [ ] Guardar el video de la animación de carga fuera de la carpeta temporal de macOS para revisarlo.

## Mapa de Inicio · cifras pendientes de fuente oficial (21 nov 2026)

- [ ] Cargar los cortes con «Cargar cortes oficiales (CSV)» debajo del mapa (formato en DECISIONS 21 nov noche). Pendiente el texto del comunicado del IGM (el sitio rechaza la lectura automática: 403) y el reporte de Honduras.
- [ ] DGME: entradas migratorias por puesto (aeropuerto, La Hachadura, Las Chinamas, San Cristóbal, Anguiatú, El Poy, El Amatillo) con período; si hay registros diarios, se habilita «Por día». Cargar en `src/lib/granjas/datos-pais.ts` con fuente y URL.
- [ ] CEPA: pasajeros en llegadas del aeropuerto (métrica distinta de las entradas migratorias).
- [ ] Revisar con el propietario las coordenadas de Las Chinamas y San Cristóbal (se ajustan al perímetro del mapa).

## Apps · YouTube

- [x] Lectura de perfil, totales y videos públicos. Vista con la estructura de Instagram, actualización manual y estados para un canal sin videos, falta de permiso o API de Analytics apagada.
- [x] Cableado de los informes de 7, 28 y 90 días con permiso de solo lectura y pruebas de respuesta simulada. Pendiente del propietario: habilitar YouTube Analytics API en su proyecto de Google Cloud y completar «Autorizar métricas» en Ezra.
- Verificación: lint, TypeScript, build aislado y 181 pruebas unitarias correctos. El entorno bloqueó los puertos de las pruebas de integración y el acceso del navegador a Ezra. El canal local ya tiene permiso de lectura de YouTube Data API; el permiso de Analytics aún no está concedido.

## Arranque en Windows y macOS

- [x] Documentados Docker Compose y la instalación nativa. Scripts compatibles con PowerShell y Terminal, plantilla local con Clerk y detección de herramientas de medios por `PATH`.
- [x] macOS con Node.js 24.18.0: lint, TypeScript, 182 pruebas unitarias, build aislado y alta de propietario con datos de ejemplo en una carpeta temporal. `docker compose config --quiet` validó la configuración.
- [ ] Completar el arranque en un equipo Windows. La ejecución de Docker y de las pruebas de integración quedó bloqueada en este entorno por los permisos del socket de Colima y de los puertos locales.

## Ingresos al país · cortes oficiales (21 nov 2026, noche)

- [ ] Completar `docs/datos/dgme-terrestres-ene-jun-2024.csv` con las cifras del PDF de la DGME (transparencia.gob.sv) y cargarlo en Inicio › Cargar CSV.
- [ ] Presentar la solicitud LAIP a la DGME con el texto de «Cómo pedir los datos» (entradas mensuales 2026 por puesto y nacionalidad).
- [ ] Opcional: cargar los meses de MITUR con cifra exacta publicada (fuente MITUR, métrica visitantes).
