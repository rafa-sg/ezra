## Relevo vigente · Eventos de El Salvador e Instagram · 17 de noviembre de 2026

Rama `feat/eventos-instagram` (desde `codex/ezra-actual-2026-11-04`), un commit por fase, sin push ni merge. El primer commit guarda tal cual el trabajo previo sin commit de la guía turística (Codex, 4 nov), porque la base real ya tenía su migración.

- **Objetivo:** cada día, a la hora elegida, encontrar eventos de El Salvador, dejar cada evento nuevo como propuesta pendiente en Spotmi y un post de Instagram listo para subir a mano; medir tokens de Gemini con presupuesto; menú reducido.
- **Menú:** Granjas · Eventos · Consumo · Calendario · Conexiones (`src/features/azra/produccion/estudio.tsx`). Secciones retiradas abren Granjas.
- **Código nuevo:** `src/lib/ia/gemini.ts` (única salida a Gemini: presupuesto + registro), `src/lib/granjas/{consumo,ajustes,tiempo,especialistas,eventos,cazador,verificador,spotmi-propuestas,pasos-eventos,instagram,diseno,pasos-instagram,horario}.ts`, API `src/app/api/granjas/{consumo,especialistas,eventos,eventos/exportar,horarios,posts}`, UI `src/features/azra/granjas/{consumo,eventos,posts,horario}.tsx`. Migraciones SQLite 3 (consumo, ajustes), 4 (eventos), 5 (posts, horarios).
- **Decisiones del propietario (17 nov):** ampliar el trigger de verificación solo con `verification_count` (el literal bloqueaba a moderación); ampliar la RPC con hora, municipio y categoría; Gemini por presupuesto de tokens y Astra/Claude con sus 30 intentos; imagen con `next/og`.
- **spotmi-web (sin commit, rama `hero` de otros):** `20261103_propuestas_ezra.sql` ampliada, nueva `20261117_eventos_conteo_solo_equipo.sql` y su prueba. Nada aplicado. La CLI está vinculada al ref `bvmzrmvrdbfpkdhwazgv` pero sin sesión, y `20261102_plan_spotmi.sql` (de otra persona) también está pendiente: por eso no `db push`. SQL listo en `work/supabase-probar-sin-aplicar.sql`, `work/supabase-aplicar.sql`, `work/supabase-habilitar-editorial.sql`.
- **Datos reales tocados (con el backend de la app):** 9 granjas archivadas (6 «Publicación de evento verificado» y 2 «Primera prueba»); creadas «Eventos de El Salvador» y «Post para Instagram» sin horario activo; base en versión 5 con copias en `data/granjas/respaldos/`. Ninguna llamada real a Gemini ni a Spotmi.
- **Verificación final:** `npm run check` 103/103; build con `EZRA_DIST_DIR=.next-verificar`; integración 7/7; arnés `work/eventos-visual.mts` (no versionado) a 1440 y 390 px sin desborde. La prueba real no se corrió: falta la cuenta editorial (`GEMINI_API_KEY` sí existe; `EZRA_PRODUCCION_IA` no).
- **Cuidado:** compilar reescribe `tsconfig.json` y `next-env.d.ts` (restaurar) y reinicia el `next dev` del puerto 3000, que al arrancar migra `data/granjas/granjas.sqlite`. Las pruebas que fijan `EZRA_DATA_DIR` en tiempo de ejecución dependen de no importar `granjas/db` de forma estática antes (ver incidente en DECISIONS).
- **Pendientes del propietario y siguiente paso:** `docs/TASKS.md` › «Te toca». Guía de uso, horario, LaunchAgent y `pmset`: `docs/GRANJAS_CAPACIDADES.md`.

## Relevo anterior · Granjas Spotmi implementadas · 27 de octubre de 2026 (tarde)

Implementado por Claude Code y verificado: granjas en `src/lib/granjas/` (SQLite, cola y trabajador, adaptadores de Instagram, Facebook, TikTok y Spotmi web, vista previa, autorización y recibos), API en `src/app/api/granjas/**` (la respuesta OAuth vuelve a `src/app/conexiones/[canal]/callback`) e interfaz en `src/features/azra/granjas/` integrada en `estudio.tsx` (pestaña «Granjas» y tarjetas de Conexiones).

- Pruebas: `tests/granjas.test.ts` (11) y `tests/integration/granjas.test.ts`. Resultado: check 82/82, compilación en `.next-verificar` y 7/7 integraciones.
- Primera prueba con datos reales: granja «Primera prueba · Noche de Catrinas (Ataco)», detenida en «Tu revisión». Nada se aprobó ni se publicó. Siguiente paso: que el propietario revise, defina la imagen y las cuentas, y apruebe.
- Codex preparó en spotmi-web `supabase/migrations/20261103_propuestas_ezra.sql` y su prueba de ataques, sin aplicarlas.
- Guía y tabla de capacidades: `docs/ESTUDIO_SPOTMI.md` › Granjas. Decisiones: `docs/DECISIONS.md`. Pendientes: `docs/TASKS.md`.
- Arneses visuales sin versionar: `work/granjas-visual.mts` y `work/granjas-flujo.mts`. Usan Clerk sin red, datos en `work/` y una compilación en `.next-visual`. Al terminar, restaurar `tsconfig.json` y `next-env.d.ts` y borrar `.next-visual`.

## Relevo anterior · Granjas Spotmi · 27 de octubre de 2026 (mañana)

El propietario pidió un prompt en inglés para que Claude construya las granjas visuales y las conexiones directas. Lee `CLAUDE_GRANJAS_SPOTMI.md` y `docs/relevos/granjas-spotmi-20261027/ESTADO_VERIFICADO.json` antes de continuar. Este nuevo alcance aún no se ha implementado. La interfaz vigente sigue siendo el Estudio Spotmi oscuro; no reactivar diseños anteriores.

El encargo de Instagram seleccionado tiene un resultado parcial manual guardado como versión 2, en revisión. No se ejecutó Gemini, no hay aprobación ni publicación y faltan verificaciones. Las conexiones sociales de publicación todavía no existen; la lectura pública de Spotmi sí respondió. Relee el estado vivo antes de editar: el propietario puede seguir trabajando.

El contenido siguiente conserva el relevo anterior como historial.

---

# Estado vigente · 27 de octubre de 2026

El propietario decidió continuar con Codex; este archivo conserva el relevo para futuras sesiones. Lee primero docs/ESTUDIO_SPOTMI.md y el apartado 2026-10-27 de AGENTS.md. El foco actual es Ezra para Spotmi, sin dependencia de Metricool/HighLevel.

---

# Azra — contexto de continuidad para Claude Code

## Relevo prioritario — navegación más fluida (2026-10-07, noche)

- Solo interacción/movimiento, sin funciones nuevas: `src/features/azra/motion.css` (+ import en `src/app/azra/layout.tsx`), tooltips `data-tooltip` en modo compacto en `shell.tsx`, envoltorio `az-view` en `bot/module.tsx`. Detalle en DECISIONS. Evidencia en `work/azra-validation/motion/`. El video de referencia no llegó adjunto.
- Nota previa (no cambiada): en `/azra/content` y `/azra/ai/chat` la barra lateral está forzada a compacta; en contenido el botón de expandir no tiene efecto.
- Verificación: check 64/64, build, integración 6/6; navegador (3107, Clerk offline): hover sin borrar el activo ni mover filas, halo con entrada/salida graduales y con foco de teclado sin mover vecinos, tooltips compactos, íconos fijos al contraer, diálogo con Escape, cambio de sección inmediato, cajón móvil, movimiento reducido.

## Relevo prioritario — «Spotmi» y formulario de Empresa (2026-10-07, noche)

**Más reciente.**

- Renombre de datos (no de código): el negocio `owner-main` (organización `owner`, antes «Mi negocio») ahora se llama «Spotmi» en `data/businesses.json`, y su `workspace.json` tiene `brand.name` «Spotmi» con `revision` 2 → 3 (para que una pestaña abierta no lo sobrescriba). Mismo id, organización, permisos y contenido. El archivo histórico `spotmi` («Spotmi», «Archivo anterior») no se tocó ni se fusionó; sigue oculto en el selector. Sgmotos y motoxspress sin cambios. Copia previa: `work/backup-rename-spotmi-20261007-193054/`. La semilla `ensurePilotBusinesses` sigue creando «Mi negocio» solo en instalaciones nuevas (no se reemplazó la frase globalmente).
- Formulario Empresa (#8, almacenamiento **local del navegador**, `AccountService` demo — no es del servidor): dos preguntas separadas «¿Para quién vas a usar ezrá?» y «¿Para qué vas a usar principalmente la plataforma?», 17 categorías y nichos dependientes en `src/features/azra/account/catalog.ts` (catálogo tipado ES/EN; «Otro» al final de cada lista; «No aplica» en Uso personal). Solo preferencias: no activan integraciones ni permisos.
- Reglas (`companySchema` en `account/model.ts`): «Especificá cuál» obligatorio solo con «Otro» y se limpia si no; uso personal (redes propias, marca personal o categoría Uso personal) no exige categoría ni nicho; nicho debe pertenecer a la categoría; al cambiar de categoría se conserva si sigue válido o se borra con aviso visible. Errores solo tras intentar guardar, luego siguen las correcciones; foco al primer campo inválido; Cancelar descarta.
- Compatibilidad: `storedCompanySchema` migra registros viejos al leerlos: `creative` → `arts_design` («Arte, diseño y creatividad»), `primaryUse/primaryUseDetail` → `primaryGoal/primaryGoalDetail`; la audiencia queda vacía (no se inventa). Eliminados textos `catalogPending`, `primaryUse*`, `businessCategoryPlaceholder`, `businessNichePlaceholder`, `creative`.
- Verificación: check 64/64 (3 pruebas nuevas: migración, validación, catálogo), build, integración 6/6. Navegador con datos aislados (`work/ask-visual-*`, Clerk offline): selector y menú muestran «Spotmi», búsqueda «spot» encuentra uno solo, Sgmotos/motoxspress iguales; registro viejo carga y se mapea; errores/foco; «Otro»; dependencia categoría-nicho; uso personal; Cancelar; persistencia tras recargar; 390 px sin desbordamiento. No se activó ningún servicio externo.

## Relevo prioritario — Bot de atención (2026-10-07, noche)

**Más reciente.** Detalle técnico y lo que falta para GHL: `docs/features/bot-de-atencion.md`.

- Pedido del propietario: módulo «Bot de atención» en el menú principal, debajo de Creación de contenido (ícono `MessagesSquare`, etiqueta al pasar el cursor). Ruta `/azra/bot` con submenú Resumen, Conversaciones, Conocimiento, Comportamiento, Automatizaciones, Probar bot, Actividad y acceso a Conexiones. Admin y clientes (solo su negocio).
- Etapa local: datos persistentes por negocio en `bot.json` (junto a `workspace.json`, incluido en el respaldo ZIP), API `/api/bot` con sesión, aislamiento por `requestBusinessId` y revisión optimista. Motor determinista de simulación (sin IA, sin proveedor): reglas obligatorias, reglas habilitadas por prioridad, solo conocimiento aprobado y vigente, aclaración/derivación, control humano detiene respuestas, pausa local.
- Inicio limpio: «Bot sin configurar», «Sin conectar», guía de 6 pasos calculada desde datos guardados, indicadores «Sin datos disponibles», sin conversaciones ni contactos de ejemplo. Las pruebas del simulador se guardan como «Prueba local N», separadas de «Reales» (vacío).
- Conexiones: panel compartido `src/features/azra/connections.tsx` también en el diálogo de Creación de contenido (antes decía «Pendiente de configurar»; ahora «Sin conectar» con los 3 canales y 4 hechos separados). Sin tokens, sin llamadas.
- Interfaz en español sin `messages` (igual que Creación de contenido); solo `botModule` en ES/EN.
- Incidente corregido en esta sesión: una primera versión de `tests/bot.test.ts` escribió `data/businesses/a|b/bot.json` (carpetas nuevas, sin datos del usuario) por importar el almacenamiento antes de apuntar a `work/`. Se borraron solo esas dos carpetas creadas por la prueba y la prueba ahora verifica que escribe en `work/`. Los negocios reales no se tocaron.
- Verificación: check 61/61 (6 nuevas del bot), build sin advertencias, integración 6/6 (bot: 401/400/404, aislamiento lectura/escritura, 409 por revisión, persistencia, páginas de cliente, `bot.json` en el respaldo). Navegador (Clerk offline, 3107, `work/ask-visual-*`): vacío, conocimiento por diálogo + aprobar, Escape, comportamiento, reglas sugeridas, probar y habilitar, simulador (respuesta con regla y conocimiento, aclaración, derivación, reclamo prioritario), tomar control → el bot no responde, nota interna, actividad, Conexiones, 390 px sin desbordamiento.
- Pendiente: integración real (ver doc), traducción EN del módulo, revisión visual del propietario.

## Relevo — Configuración reducida (2026-10-07, tarde)

- Configuración solo tiene Mi perfil, Empresa y Usuarios. Eliminados (recuperables de git): `src/features/azra/{credentials,workflows,announcements}/`, `tests/azra-credentials.test.ts`, 132 textos ES/EN, el componente «Pendiente». `/azra/settings` y cualquier URL vieja de ajustes → Mi perfil. En Empresa › Funciones los «Configurar» quedaron deshabilitados (apuntaban a páginas eliminadas).
- **Pendiente de confirmación del propietario:** borrar el acceso `sgmotos` con `rafasanguti11@gmail.com` de `data/access.json`. Es el acceso del cliente Sgmotos (no un duplicado). No se borró nada; no hay semillas con ese correo. El usuario de Clerk y el localStorage del navegador quedan a cargo del propietario.

## Relevo prioritario — «Pregúntale a la IA» real con Gemini (2026-10-07)

**Más reciente; prevalece sobre los bloques inferiores que dicen que el compositor está deshabilitado o «Integración pendiente».**

- Pedido del propietario: Ask AI real con la API de Gemini, solo uso interno, respondiendo **solo** sobre los datos de la app. SDK oficial `@google/genai` (2.27.0, agregado a `package.json`).
- Servidor: `POST /api/ask?business=<id>` (`src/app/api/ask/route.ts`). Exige sesión Clerk (`requireAccount`) y `?business` autorizado (`requestBusinessId`: cliente solo su organización, ajeno → 404). Lee `GEMINI_API_KEY` y `GEMINI_MODEL` en cada solicitud; la clave nunca sale del servidor (verificado: 0 coincidencias en `.next/static`). Modelo por defecto `gemini-3.5-flash-lite` (Flash-Lite estable según ai.google.dev/gemini-api/docs/models, 2026-10-07). Timeout 30 s.
- Lógica: `src/lib/ask/assistant.ts` (instrucción de sistema en español, ciclo de function calling de hasta 3 rondas + respuesta final con herramientas apagadas, conserva el turno del modelo para las firmas de pensamiento de Gemini 3, `maxOutputTokens` 800, respuesta recortada a 2500 caracteres, historial validado: ≤20 turnos, ≤2000 caracteres c/u, último del usuario; errores en español para clave faltante/inválida, modelo inexistente, 429, timeout; límite de **5 preguntas por minuto por cuenta**, en memoria). `src/lib/ask/tools.ts`: herramientas de solo lectura.
- Fuentes de datos reales hoy (workspace del negocio activo, sin publicaciones de ejemplo `demo`): publicaciones con estado y fecha prevista (`get_scheduled_posts`, periodos hoy/mañana/semana lun–dom/7 días/próximas, en America/El_Salvador), conteo por estado y por plataforma (Instagram/Facebook). Campos mínimos: título (≤80), plataforma, formato, estado, fecha/hora. Nunca texto completo, contactos, correos ni teléfonos.
- **No existen** y responden «no conectado»: métricas (`get_post_metrics`) y mensajes/contactos (`get_messages_summary`). «Publicado» = marcado manualmente; ezrá no está conectado a Instagram/Facebook. No había archivo estático de contexto de negocio que borrar.
- UI: `src/features/azra/chat.tsx` (sacado de `screens.tsx`): compositor activo, Enter envía / Shift+Enter salto, estado «Consultando los datos del negocio…», error en recuadro y la pregunta vuelve al cuadro para reintentar, «Nuevo chat» limpia, la conversación se reinicia al cambiar de negocio y vive solo en memoria. Buscar/Plantillas/Personalizar, adjuntar y voz siguen deshabilitados («Todavía no disponible»). Se eliminó la clave `integrationPending`.
- Configuración: `.env.local` (ignorado) con `GEMINI_API_KEY=...`; `.env.example` documenta ambas variables. Al iniciar esta tarea `.env.local` **no** tenía `GEMINI_API_KEY` y no existe `.env`: el propietario debe agregarla y reiniciar `npm run dev`.
- Pruebas: `tests/ask.test.ts` (6: periodos en hora SV, campos mínimos sin texto/teléfono/correo, no conectado, ciclo con herramientas y firma, límite de rondas/largo, historial/errores/límite por minuto; Gemini simulado). Integración: 401 sin sesión, 400 sin negocio o historial vacío, 404 negocio ajeno, 503 sin clave (el servidor de prueba fuerza `GEMINI_API_KEY=""`, nunca llama a Gemini). check 60/60, build sin advertencias, integración 6/6. Navegador (Clerk offline, 3107, datos en `work/ask-visual-*`): vacío, error sin clave, carga, turnos con respuesta simulada en el navegador, 390 px sin desbordamiento. Sin llamadas reales a Gemini en esta sesión.
- Límites: el límite por minuto se reinicia al reiniciar el servidor; el historial del modelo lo envía el navegador (solo afecta la propia conversación del usuario); costo real depende del uso (plan gratuito con límites de Google).
- Prueba real (2026-10-07, tarde): la clave está en `.env.local` (no hay `.env`; Next carga `.env.local`). Llamada directa a `gemini-3.5-flash-lite`: «CONECTADO», 865 ms, 14 tokens. Extremo a extremo en servidor aislado 3107 (Clerk offline, 3 publicaciones de prueba en `work/ask-visual-*`, nunca `data/`): lista correcta de programadas de la semana, «me gusta» → «no conectado», receta de pupusas → declinada. Correcciones tras la prueba: el día de la semana lo calcula la herramienta (`weekday`, `todayWeekday`; el modelo había dicho «miércoles 8»), respuestas en texto plano (se limpia Markdown), un reintento automático ante 500/503 y mensajes propios para 503 («Gemini está saturado…») y 504 («tardó demasiado»). Google devolvió 503 «high demand» y un 504 durante la prueba. El servidor registra solo el código de estado (`[ask] Gemini falló: 503`). check 62/62.
- Siguiente: el propietario prueba con su clave; luego conectar métricas/mensajes reales cuando exista la fuente (Meta/GHL) y, si se pide, consultas al catálogo verificado.

## Relevo prioritario — login arcade EZRA (2026-10-07)

- Pedido del propietario: rediseñar **el login existente** (no uno nuevo) según su captura: panel arcade oscuro (44 %) + formulario blanco (56 %). Hecho en `src/components/access-screen.tsx`, `src/styles/access.css` (reescrito, estilos aislados `.arcade-*` y `ez-clerk-*`) y el componente nuevo `src/components/arcade-panel.tsx` (canvas + requestAnimationFrame; HTML accesible para identidad, contador, instrucciones, «Saltar», cierre y «Volver a jugar»).
- Secuencia: identidad «EZRA.» centrada 2,4 s → sube; AUTOMATIZA/PUBLICA/CONECTA/CRECE/DOMINA bajan escalonadas (misma velocidad, 2,6 s de separación, aparecen bajo la identidad con fundido) y reingresan si llegan al fondo; nave pixelada con mouse o flechas, disparo con clic o espacio (cadencia 0,2 s), impacto o choque destruye la palabra con partículas violeta/lima. 5/5 o «Saltar» → «EZRA AUTOMATIZA / TU PRESENCIA / DIGITAL.» + «Todas tus redes. Un solo lugar.». Teclado solo con el panel enfocado (listeners nativos en el panel, `role="application"`); nunca intercepta el formulario. Estado React solo al cambiar contador/fase.
- Modo estático (sin juego): `prefers-reduced-motion`, panel <340 px de ancho o <520 px de alto (incluye móvil: panel compacto arriba, 300 px). DPR hasta 2, ResizeObserver, limpieza de animación y eventos al desmontar.
- Formulario: el mismo Clerk (`SignIn`/`SignUp`, rutas y redirecciones sin cambios); textos en voseo («Iniciá sesión», «Bienvenido a EZRA.», «¿No tenés cuenta? Registrate», «Creá tu cuenta»…), etiqueta visible con ícono de sobre, ancho 420 px, sin tarjeta. No se agregó el aviso «Demo local. Sin servicios de autenticación conectados» de la captura: la autenticación es real (sería falso). «Secured by Clerk» se mantiene.
- Verificación: check 54/54, build, integración 6/6; navegador en `/sign-in` del 3000 (sin iniciar sesión): intro, juego, 2 impactos con espacio, «Saltar», cierre, móvil 390 sin desbordamiento, un solo `h1`.

## Relevo prioritario — un solo panel para todas las cuentas (2026-10-07)

**Más reciente; prevalece sobre los bloques inferiores que hablan del estudio de negocios o del shell por empresa.**

- Decisión del propietario: todas las cuentas (administración, Sgmotos, motoxspress) usan el mismo panel de «Pregúntale a la IA»; las funciones del estudio se **eliminaron del código** (no ocultaron). Clientes: en Configuración solo «Mi perfil». Respaldo previo: commit `0767994` y rama `backup/pre-eliminar-estudio-2026-10-07` (estudio completo recuperable).
- Eliminados: `src/components/{studio,catalog-page,campaign-wizard,editor,artwork,appearance-panel,social-setup,owner-dashboard,commercial-app}.tsx`, `src/features/azra/business-overview.tsx`, modo «negocio» de `AzraShell`, 29 textos, ~770 reglas de `studio.css` (queda solo marca y estado de aviso) y reglas del modo negocio en `azra.css`; prueba de «preparación de redes» en `tests/campaign.test.ts`. `src/components/ui.tsx` conserva solo `Mark`.
- Conservado a propósito (lógica, no pantallas): todas las APIs `/api/*` y `src/lib/*` (sesión, permisos, negocios, catálogo, workspace, medios, exportación, automatización, `lib/theme`) y sus pruebas; `data/` intacta. Se pueden borrar después si el propietario lo pide; Ask AI podrá usar catálogo verificado.
- Entrada: `src/app/page.tsx` → cuenta válida a `/azra/ai/chat`; problema de cuenta → `src/components/access-issue.tsx` (mismos textos y «Usar otro correo»); sin sesión → login. `/azra` admite clientes (`src/app/azra/layout.tsx` pasa rol y organización); `src/app/azra/[[...segments]]/page.tsx` redirige a clientes a Ask AI salvo `ai/chat` y `settings/profile/*` (servidor). APIs de administración siguen con `requireAdmin`.
- Selector de cuentas = negocio activo de Ask AI (`src/features/azra/account/active-business.tsx`, lista desde `/api/businesses` acotada por rol, elección en localStorage `azra:activeBusiness`). Admin ve todos; cliente solo los suyos y crea solo en su organización. El chat muestra el negocio activo. Logo de agencia solo se pide como admin.
- Aislamiento demo: los datos demo de cuenta en el navegador usan clave propia por cliente (`setAccountScope`); administración conserva `azra:account:demo:v1`.
- Reparado: un comentario sin cerrar en `azra.css` (de una limpieza automática anterior) desactivaba ~6,8 KB de reglas (insignias, selector, plantillas); cerrado y comentarios con saltos raros normalizados. `tsconfig.json` excluye `work/` (arneses temporales).
- Verificación: check 54/54, build sin errores/advertencias, integración 6/6 (cliente entra a Ask AI y perfil, bloqueado en ajustes de agencia, `/` y `/?business=` van a Ask AI). Navegador con Clerk offline: admin y Sgmotos, 1440 y 390 px, sin desbordamiento.
- Siguiente: Ask AI real (proveedor y costo dentro de USD 20), usando el negocio activo y sus datos vía API autorizada. El propietario debe probar con su cuenta real.

## Relevo prioritario — menú reducido a «Pregúntale a la IA» (2026-10-07)

- Pedido del propietario: el menú principal del panel `/azra` tiene **solo** «Pregúntale a la IA» (mismo ícono y estado activo); empezar funcionalidad real por Ask AI. Se quitaron AI Suite, Launchpad, Tablero de la agencia, Prospección, Subcuentas, Instantáneas de la cuenta, Ideas, Aplicación móvil y de escritorio. Sin cambios en logo, selector de cuentas, «Configuración», botón de contraer, barra superior ni estilos del menú.
- Inicio: `/azra` → `/azra/ai/chat`; tras el login, la administración en `/` va a `/azra/ai/chat` (`src/app/page.tsx`), igual que los enlaces del estudio («Panel de administración», antes «Tablero de la agencia») y `AgencyRedirect`. URLs viejas `/azra/agency` y `/azra/prospecting/*` redirigen a Ask AI (`src/app/azra/[[...segments]]/page.tsx`); otras rutas desconocidas siguen en 404. «Volver atrás» de Configuración y el inicio de la miga de Usuarios apuntan a Ask AI.
- Eliminado (recuperable desde `a607921`): módulo `src/features/azra/prospecting/` completo, `tests/azra-prospecting.test.ts`, componente `Agency` (estado vacío «Conectá Stripe») de `screens.tsx`, sus rutas en `routes.ts`, 90 textos ES/EN sin otro uso y las reglas CSS que solo usaban esas pantallas (se conservaron las clases dinámicas `az-status-*` y `az-priority-*`). Se agregó la clave `mainNavigation`. Los datos locales demo de prospección (`azra:prospecting:demo:v1`) quedan en el navegador, inofensivos.
- Nota: la página de chat compacta el menú lateral (comportamiento previo, sin cambios); al ser ahora el inicio, la administración entra con el menú en íconos.
- Verificación: `npm run check` 55/55 (4 pruebas de prospección eliminadas con el módulo), build sin errores ni advertencias, integración 6/6 con redirecciones nuevas, lint sin importaciones sin usar.
- Siguiente: construir Ask AI real (definir proveedor/costo antes de conectar; hoy el compositor está deshabilitado y dice «Integración pendiente»).

## Relevo prioritario — nuevo login (2026-10-07, noche)

- Pedido del propietario: login con la estructura de su referencia (panel dividido tipo «FocuMinds»: panel de color con logo, frase, descripción y 3 puntos; tarjeta centrada sobre fondo con puntos) y la identidad de ezrá. Hecho en `src/components/access-screen.tsx` + `src/styles/access.css` (nuevo). El panel usa el violeta del piloto (no el azul de la referencia). Se quitaron de `studio.css` solo las reglas del login anterior (`.access-page`, `.access-intro…`, `.access-auth…`). Los tres puntos describen funciones reales (catálogo verificado, revisión antes de publicar, un espacio por negocio). En móvil se ocultan para que la tarjeta aparezca primero (top ≈306 px).
- Lógica intacta: Clerk `SignIn`/`SignUp` con las mismas rutas y redirecciones; solo `appearance` (clases `ez-clerk-*`) y textos. Localización en `src/app/layout.tsx`: «Inicia sesión», «Bienvenido de vuelta a ezrá.», «o con tu correo», marcadores «tu@correo.com»/«Crea una contraseña», registro «Crea tu cuenta» / «Usa el correo que te asignó la administración.». Etiquetas de campo ocultas visualmente (`ez-sr-only`), accesibles.
- En esta versión de Clerk (`@clerk/nextjs` 7.9.10) `appearance.layout` se llama `appearance.options`. `options.unsafe_disableDevelopmentModeWarnings` en el `ClerkProvider` oculta el aviso «Development mode»; las claves siguen siendo de desarrollo. «Secured by Clerk» se mantiene (quitarlo es función de pago).
- Verificado en `/sign-in` y `/sign-up` del 3000 sin iniciar sesión (1440 y 390, sin desbordamiento). 59/59, build, 6/6.

## Relevo prioritario — revisión visual y función 1 del foro (2026-10-07, tarde)

**Este bloque es el más reciente; el bloque «panel por empresa» de abajo sigue vigente.**

- Revisión visual hecha con un arnés propio (`work/business-review-server.mts`, no versionado): Studio real + API real, Clerk offline, datos aislados en `work/business-review-*`, puertos 3127/3128 (Sgmotos) y 3137/3138 (motoxspress), ya detenidos. No se usó 3118 ni `data/`. 1440×900 y 390×844, las 7 vistas de cada empresa.
- Aislamiento confirmado en ambos: `/api/businesses` solo devuelve su negocio; workspace de la otra empresa → 404; `/api/auth/accounts` → 403; sin selector administrativo. Sin desbordamiento horizontal; Escape cierra el menú móvil.
- Corregido: texto dañado «publicaciónl» → «historial» (3 lugares de `studio.tsx`, error previo a la migración); mes de Agenda «Octubre De 2026» → «Octubre de 2026» (capitalización en código y `text-transform: none` solo en `.az-business-content`); buscadores de Catálogo/Publicaciones legibles (14 px, ancho 320, sin doble borde); piso de legibilidad de 12 px para el texto del piloto dentro del shell (bloque generado en `azra.css` desde las 146 reglas <12 px de `studio.css`, sin tocar el CSS del piloto); «Cerrar sesión» en móvil solo ícono con `aria-label`.
- Calendario en móvil: se desplaza horizontalmente dentro de su recuadro (630/356 px); permitido por las reglas, sin cambio.
- Función 1 del foro **preparada, no implementada**: `docs/features/plantillas-de-marca.md` (qué existe, modelo propuesto, reglas de datos verificados, aislamiento, aceptación, fase GHL con Design Kits/Brand Boards API v3 y lo que falta verificar). Bloqueada por 5 decisiones del propietario listadas ahí.
- Decisiones que también esperan al propietario (no se cambiaron): (a) voz mezclada en un mismo panel: el piloto usa «tú» («Agrega», «Puedes») y lo nuevo voseo («Prepará»); (b) la tarjeta «Presupuesto del piloto · $20» de Ajustes la ven los clientes; (c) los colores de «Apariencia del panel» ya no tienen efecto visible.
- Verificación: `npm run check` 59/59, build correcto, `npm run test:integration` 6/6, `git diff --check` limpio. Sin commit.
- Próximo paso: respuestas del propietario a las decisiones → implementar la fase local de plantillas (modelo, editor en Marca y criterios, paso en el asistente, pruebas de aislamiento). GHL solo tras una lectura de prueba de Brand Boards con su integración.

## Relevo prioritario — panel por empresa (2026-10-07)

**Relevo solicitado explícitamente con «claudeya». Este bloque prevalece sobre los pendientes históricos que aparecen más abajo.**

- Carpeta compartida: `/Users/rafaelsandoval/Desktop/Spotbot`. Rama actual: `feat/migracion-ezra`. Hay numerosos cambios sin commit anteriores a esta sesión: no hacer reset, checkout destructivo ni atribuir todos los cambios a este turno. Leer `git diff` antes de continuar; una sola IA modifica archivos.
- Aplicación habitual: `http://127.0.0.1:3000`. Vista de verificación aislada: `http://127.0.0.1:3118`, con backend de prueba en 3117 y datos en `work/`. No es la cuenta real del propietario. En ese arnés, crear negocio/cerrar sesión son callbacks sin operación y los bindings cliente de Clerk/Next se sustituyen para la inspección visual; el aislamiento HTTP se prueba aparte con Clerk offline firmado. No copiar el arnés a producción. Puede detenerse al terminar la revisión.
- Alcance visual: estructura compartida, cabecera/menú y resumen nuevos; las pantallas funcionales de catálogo/editor/agenda se conservan dentro del shell con estilos adaptados. No afirmar que todos sus componentes internos fueron reescritos. Falta aceptación visual del propietario.
- Meta futura del propietario: redes propias, creación/publicación multicanal, competencia, bot y métricas sobre GHL. El repositorio sigue siendo Next.js local: conexión real a GHL no acreditada ni instalada en este trabajo. Solo preparar ideas realizables; no prometer funciones por aparecer en el foro.
- Investigación GHL: existe MCP oficial (`https://marketplace.gohighlevel.com/docs/other/mcp/index.html`). La documentación pública y staging difieren; staging describe lectura de definición, catálogo de pasos, validación, creación/edición y cambio de estado, con páginas v3/v4. Verificar scopes realmente concedidos (`workflows.readonly`, escritura y publicación si disponibles) y versión antes de implementar. No se instalaron MCPs ni se habilitaron servicios. Fuentes: `https://staging.marketplace.gohighlevel.com/docs/ghl/workflows/workflows/index.html` y `docs/DECISIONS.md`.

- Pedido vigente: Sgmotos debe usar el diseño nuevo de administración, conservando datos/permisos propios. Implementado compartiendo `AzraShell`; no dar rol admin a clientes ni dirigirlos a ajustes de agencia.
- Archivos clave: `src/components/studio.tsx` (shell nuevo por defecto, panel anterior retenido con `legacyPanel=false`), `src/features/azra/shell.tsx` (opciones de negocio), `business-overview.tsx` (inicio real), `azra.css`, mensajes ES/EN. Las APIs y autenticación conservan el aislamiento existente. Todos los negocios que usan Studio reciben la estructura nueva.
- La ruta sigue `/` / `?business=…&view=…`; `/azra` es solo administración. No activar el panel anterior mediante parámetros de URL. El código previo sigue disponible, no se borraron datos.
- Validación: check (59 unitarias), build y 6 integraciones. Integración ampliada para verificar que Sgmotos no puede consultar/exportar motoxspress ni administrar usuarios. API oculta negocios ajenos con 404.
- Verificación visual con el componente real Studio y API real en un entorno aislado `work/business-shell-*`: escritorio 1440×900, móvil 390×844; navegación, Escape, borrador guardado y persistente tras recargar, paso a revisión y aprobación bloqueada sin comprobaciones. Agenda móvil sin desbordamiento. Fixture de Clerk offline, no prueba de inicio de sesión real. Herramienta temporal `work/business-preview-server.mts` (no versionada), nunca usa datos reales.
- Pendiente: revisión del propietario con su sesión real; completar traducción de pantallas heredadas (negocios siguen en español; no se ofrece traductor allí); conexiones GHL y funciones del foro en fases posteriores. Se conservaron cambios ajenos ya presentes, no hay commit nuevo.
- Comando del propietario: cuando diga «Claudeya», actualizar este archivo y TASKS con todo el contexto útil, pruebas/pendientes y siguiente paso. Regla persistida en AGENTS.md.
- Próximo paso: revisar la apariencia con el propietario; después especificar una función del foro por vez, empezando por plantillas de marca y datos verificados. No activar APIs ni gasto por leer este relevo.

Actualizado: 7 de octubre de 2026 (migración ezrá en curso). Proyecto local: `/Users/rafaelsandoval/Desktop/Spotbot`.

## Punto exacto del relevo

La base de Stage 1 está implementada bajo `/azra`. El ciclo de credenciales funciona **solo en demostración local**, detrás de un servicio intercambiable. Stage 2 empezó: perfil general (#6), seguridad (#7), empresa (#8) y usuarios (#9) ya tienen contenido sobre `AccountService` demo. Las demás pantallas tienen rutas, navegación y referencias, pero su contenido sigue pendiente.

**Decisión del propietario (2026-10-06):** Reventa, Complementos, Portal de afiliados, Biblioteca de plantillas, Socios, Universidad, Educación en SaaS y Swag NO se agregarán. Se quitaron del sidebar global con sus textos; no reintroducirlos. «Afiliados» de Ajustes (#25/#33) sigue en alcance.

**Decisión del propietario (2026-10-06, 23:20):** nada de premium (palabra, diamante, bloqueos, «Mejorar plan»): implementar solo la funcionalidad. Sin insignias «Nueva» en el menú global. Los videos que el propietario pega desde la miniatura de captura viven en `/var/folders/.../TemporaryItems`, que macOS no deja leer: pedir que los guarde en el Escritorio o en `Diseño Spotbot`.

**Referencias nuevas por chat (2026-10-06):** el propietario aportó capturas de GHL en español (selector abierto, crear subcuenta, plantillas de instantánea, hover de plantilla, perfil). Se aplicaron al tablero y al shell; ver DECISIONS e INVENTORY «Referencias adicionales». Textos visibles en esas capturas usan la terminología de GHL en español; lo demás, voseo. El propietario sugirió observar GHL directamente: requiere que él inicie sesión en la pestaña del navegador; Claude no ingresa contraseñas. NO anunciar el sitio completo ni una reproducción pixel-perfect terminada.

El propietario pidió terminar las tareas prioritarias y dejar este relevo. La prioridad implementada fue: fundamentos, ES/EN, navegación, tokens/permisos/rotación/revocación, pruebas y documentación. No se necesita decidir Azra frente a HighLevel para continuar.

**Leer primero:** `AGENTS.md`, `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, este archivo y `docs/design/azra/INVENTORY.md`. `docs/CLAUDE_HANDOFF.md` conserva el contexto histórico del piloto; para la nueva interfaz Azra prevalece este relevo. Antes de usar APIs de Next, leer la guía correspondiente en `node_modules/next/dist/docs/`.

## Migración ezrá (en curso, 2026-10-06)

Pedido del propietario: la estructura nueva (capturas) gana en layout, componentes, navegación y pantallas; la interfaz anterior (piloto ezrá en `/`) gana en identidad: nombre **«ezrá.»** tal como en sus capturas y paleta blanca/lila suave. Conservar la lógica útil (login, sesiones, protección de rutas, API, validaciones, estado). Decisiones confirmadas: negocios = subcuentas; menú lateral blanco con lila.

**Respaldo:** rama `backup/pre-migracion-ezra-2026-10-06`, commit `a607921` (estado completo de ambas interfaces, incluidos cambios locales del piloto). Trabajo actual en `feat/migracion-ezra` sin commit.

**Conservado tal cual (lógica del piloto):** `src/proxy.ts` (solo loopback, origen, Clerk), `src/lib/auth.ts` (`sessionAccount`, `requireAccount/Admin`, correo verificado y vinculación), `access-store`, `businesses` (directorio, creación validada y autorizada por rol), toda la API `/api/*`, catálogo, publicaciones/revisión, exportación, automatización n8n, medios, `data/`, pantallas `/sign-in` y `/sign-up` (`AccessScreen` con Clerk) y el estudio de negocios en `/?business=…`.

**Adaptado a la estructura nueva:**

- Marca: por pedido del propietario (2026-10-07) el sidebar no muestra el texto «ezrá.»: solo un cuadro de logo centrado como en la referencia GHL, con el ícono original de la app (`src/app/icon.svg`, cuadro violeta con flor). El logo propio de Marca Blanca ya se guarda (ver «Logo de agencia») y reemplaza este ícono; al eliminarlo vuelve el ícono por defecto. Título `ezrá · Panel de agencia`; clave i18n `brand` como etiqueta accesible.
- Tokens: `.azra` usa los valores exactos de `globals.css`/`studio.css` (paper `#fafaf8`, surface `#fff`, ink `#272a2d`, ink secundaria `#4d4a55`, muted `#86888b`, line `#e9e9e6`, sutil `#f7f6f9`, violet `#7760d8`, violet-dark `#624bbe`, lilac `#f0edf9`, green `#52806d` / `#edf5ef`) y la tipografía del sistema del piloto. Se eliminaron azules/navy/dorados de GHL; el sidebar es blanco con activo lila y texto violeta; íconos de cabecera lila; avatar violeta. Gráfico: violeta + verde saturado `#2f8f6b` (el verde del piloto no pasa el umbral de croma).
- Protección: `src/app/azra/layout.tsx` llama a `sessionAccount()` en el servidor; sin sesión → `/sign-in`; error/cuenta no vinculada → `/`; cliente → `/` (su estudio); solo administración entra. La cabecera muestra el correo y «Cerrar sesión» (`useClerk().signOut`, redirige a `/`).
- Subcuentas = negocios reales: el selector lista `/api/businesses`; abrir lleva al estudio (`/?business=id`); «Crear» → plantillas → datos obligatorios del piloto (tipo, organización) → `POST /api/businesses`; el pin es preferencia local. «Constructor por subcuenta» también usa negocios reales. Cliente HTTP en `src/features/azra/account/businesses.ts`.

- Entrada de administración (pedido del propietario 2026-10-07): `src/app/page.tsx` verifica la sesión en el servidor y redirige al administrador sin `?business` a `/azra/agency`; el enlace «Mi panel» del estudio ahora dice «Tablero de la agencia» y lleva allí; si el cliente de `/` queda sin negocio seleccionado redirige igual. Clientes y `/?business=…` siguen en el estudio del piloto.
- «Accesos de tus clientes» → Configuración › Usuarios (#9): tabla con las cuentas reales de `/api/auth/accounts` (admin, clientes y espacios pendientes de Sgmotos/motoxspress), «Editar acceso»/«Asignar correo» con el mismo texto de ayuda y `POST /api/auth/accounts` (el servidor valida, impide duplicados y revincula).

- Logo de agencia (pedido del propietario 2026-10-07): `src/lib/agency-brand.ts` + `/api/agency/logo` (GET imagen o `?meta`, POST multipart, DELETE; solo administración vía `requireAdmin`). Se valida por contenido con `detectMedia` del piloto (PNG/JPG/WebP, ≤2,5 MB, un archivo renombrado se rechaza con 422), se escribe en `data/agency/` dentro de la cola `enqueueWrite` con `writeJsonAtomic` y permisos 0600, y el archivo anterior se borra solo después de actualizar los metadatos. Respuesta con `nosniff` y `no-store`. La sección Logotipo sube/reemplaza/borra con Cancelar/Guardar y el sidebar se actualiza por evento. Pendiente: la exportación/copia del piloto aún no incluye este logo; el logo no se muestra a clientes (el estudio usa la apariencia por negocio).

**Reemplazado:** paleta y nombre «Azra» de la interfaz nueva; subcuentas ficticias del demo como fuente del selector; «Mi panel» del piloto como pantalla de inicio de la administración; usuarios demo derivados del perfil como fuente de la tabla Usuarios.

**Eliminado:** nada del piloto. En la interfaz nueva solo reglas CSS de color muertas (círculos GHL) tras la capa de marca.

**Pendiente de revisión (se conserva, preguntar antes de quitar):** `src/components/owner-dashboard.tsx` («Mi panel», ya no se muestra; sus métricas por negocio —productos/publicaciones/por revisar— aún no tienen lugar en el tablero nuevo); métodos demo `listSubaccounts/createSubaccount/setPinned` y `listUsers` con su esquema (sin uso en UI); la plantilla de instantánea elegida no se aplica al negocio.

**Plan histórico de migración (el bloque prioritario superior registra el shell de negocios ya implementado):** (1) hecho: `/` admin → tablero nuevo y accesos → Usuarios; (2) reacomodar el estudio (`studio.tsx`: Resumen, Catálogo, Publicaciones, Agenda, Fuentes, Marca y criterios, Ajustes) dentro del shell nuevo como vista de subcuenta, con la misma lógica; (3) mover rutas `/azra/*` a la raíz y retirar el aviso «Demostración local» donde ya hay datos reales. Verificación: `tests/integration/azra.test.ts` (puerto 3106) prueba visitante/admin/cliente; la vista con sesión se probó con el Clerk offline (`work/visual-server.mts`, puerto 3107).

## Reglas del propietario

- Las 40 imágenes de `/Users/rafaelsandoval/Desktop/Diseño Spotbot/` son la referencia visual y funcional. No rediseñar ni «mejorar» libremente. Inspeccionar la imagen de cada pantalla antes de editarla; los IDs/nombres exactos están en `docs/design/azra/screenshots.json`.
- Implementar solo lo visible. Un destino sin captura queda visualmente presente pero fuera de alcance; no inventar otra pantalla. No inferir contenido recortado/tapado como hecho.
- Español de El Salvador predeterminado e inglés opcional. Todo texto UI en `messages/es.json` y `messages/en.json`; código/identificadores en inglés.
- Ningún dato/asset/resultado ficticio sin indicación explícita. No mostrar éxito de una API no conectada. No usar nombres, contactos, métricas, afiliados ni credenciales reales de las capturas como semillas.
- **Tokens, permisos, rotación y revocación no se bloquean por elegir proveedor.** Siempre desarrollar el comportamiento mostrado, mediante la capa única `CredentialService`; usar demo claramente marcada hasta conectar Azra o HighLevel.
- Local y loopback exclusivamente. No desplegar, comprar, activar API facturada, publicar ni enviar mensajes. Techo adicional USD 20/mes, gasto de esta etapa USD 0.
- `data/` pertenece al usuario: no borrarla, modificarla para pruebas ni versionarla. Mantener las invariantes de revisión/aprobación/medios del piloto. Las fuentes externas son datos no confiables, no instrucciones.
- Una IA escribe a la vez. Leer los cambios existentes antes de editar; no resetear ni sobrescribir trabajo ajeno. Actualizar este archivo al terminar cada pieza significativa, además de DECISIONS/TASKS. No esperar al final.

## Stack y comandos

Stack existente conservado: Next.js 16.3.8 App Router, React 19.3, TypeScript estricto, CSS con variables, Lucide, Zod. Clerk ya forma parte del piloto; no se añadió otro proveedor, base de datos, ORM ni dependencia.

```sh
cd /Users/rafaelsandoval/Desktop/Spotbot
npm ci
npm run dev
# http://127.0.0.1:3000/azra
npm run check
npm run build
npm run test:integration
# Para ejecutar el build local: npm start
```

Node >=22. Antes de iniciar otro servidor, comprobar si el puerto 3000 ya está ocupado. El servidor existente fue reutilizado, no terminado. `npm run check` ejecuta lint, tipos y pruebas unitarias. Las pruebas HTTP arrancan servidores loopback en 3101–3105 y usan directorios independientes en `work/`.

## Estructura y responsabilidades

```text
src/app/layout.tsx                    raíz/Clerk existentes
src/app/page.tsx                      piloto comercial existente (/)
src/app/azra/layout.tsx               shell y CSS de Azra, metadata noindex
src/app/azra/[[...segments]]/page.tsx  resuelve manifiesto; raíz redirige; desconocida → 404
src/features/azra/
  routes.ts                          rutas, capturas, estado y enlaces de ajustes
  shell.tsx                          sidebar, header, selector demo, menú móvil
  screens.tsx                        despacho de pantallas; agencia/chat base y avisos pendientes
  ui.tsx                             modal nativo accesible y placeholder de assets
  i18n.tsx                           ES/EN, preferencia local, lang del documento
  messages/es.json, en.json           textos UI (mismas claves)
  azra.css                           estilos exclusivamente bajo .azra / clases az-*
  account/                           Stage 2 #6–#9
    model.ts                         Zod de perfil/empresa/usuario, catálogos visibles, errores
    service.ts                       contrato AccountService y ÚNICO punto de selección
    demo.ts                          adaptador localStorage vacío; contraseña/sesiones → notConnected
    fields.tsx                       useAccount, Field, PhoneInput, CopyButton, issueKeys
    profile.tsx, company.tsx, users.tsx  pantallas #6/#7, #8 y #9
    switcher.tsx                     selector de subcuentas, crear y plantillas de instantánea
    company-tabs.tsx                 dirección, funciones, marca blanca, avanzada, SSO (video)
  workflows/                         #10: model/service demo y pantallas (creador por defecto)
  announcements/                     #20: catálogo legible, service demo y pantalla
  prospecting/                       #38, #3, #5, #4, #39
    model.ts, service.ts, demo.ts    secciones/alojamiento visibles, ProspectingService, demo localStorage
    layout.tsx                       cabecera+pestañas compartidas, useProspectingSettings
    screens.tsx                      cuentas (vacío+primeros pasos) y Prospect AI
    report-builder.tsx, analytics.tsx, settings.tsx
  credentials/
    model.ts                         validación Zod, permisos, modelo, errores, siete días
    service.ts                       contrato async y ÚNICO punto de selección de adaptador
    demo.ts                          adaptador local sin red ni credenciales reales
    screens.tsx                      vacío, básico/permisos, éxito, detalle y acciones
src/components/, src/lib/             piloto existente; no migrarlo incidentalmente
tests/azra-credentials.test.ts        transiciones, errores, persistencia y paridad ES/EN
tests/azra-account.test.ts            demo vacío, validación, corrupción, auth nunca exitosa
tests/azra-settings.test.ts           flujos, avisos bloqueados, ajustes de empresa y almacenes antiguos
tests/azra-prospecting.test.ts        valores por defecto, orden válido, corrupción, analítica en cero
tests/integration/                   regresión HTTP del piloto, datos aislados
docs/design/azra/screenshots.json     40 IDs y nombres exactos; sin imágenes/secretos
docs/design/azra/INVENTORY.md          pantalla por pantalla, dependencias, mapa/estados
docs/design/azra/NEXT_STEPS.md         instrucciones de trabajo y aceptación para Claude
work/azra-validation/                 evidencia local ignorada por Git
data/                                información privada del usuario, no tocar
```

Para ampliar: crear módulos por área dentro de `src/features/azra/` y componentes compartidos solo si se reutilizan realmente. Mantener el despacho fino en `screens.tsx`; no acumular todos los formularios allí. Los servicios son la frontera con proveedores; no hacer fetchs a proveedores desde componentes ni poner secretos en `NEXT_PUBLIC_*`.

## Diseño y convenciones

Variables actuales de `azra.css`: sidebar `#2f3747`, seleccionado `#1b202b`, selector `#4d5562`, superficie `#ffffff`, fondo `#f9fafb`, fondo formulario `#f3f7fa`, borde `#d1d5dc`, texto `#182230`, secundario `#667085`, azul provisional `#155df5`, peligro `#d92d20`. El `#0059ff` de la captura #19 pertenece a la configuración del correo y no determina el azul global.

Sidebar 224 px (210 en tablet), compacto 64; header 57 px; página 30 px horizontal/25 vertical; botón 38 px mínimo; bordes 6 px, tarjetas 8 px, modal 12 px. Base 14 px; títulos 24/19/15. Escala de espacios 4/8/12/16/20/24/30/40. Son estimaciones de referencia, no medidas certificadas: ajustar contra imágenes sin cambiar la intención visual. Formulario con tarjeta blanca, icono, contadores interiores, pestañas azules y acciones abajo a la derecha (#29–31).

Fuente provisional Arial/Helvetica/sans-serif; **falta fuente exacta**. Lucide aproxima los iconos: no afirmar equivalencia exacta. Logos/ilustraciones originales son placeholders visibles, no recreaciones inventadas. El aviso demo y selector ES/EN son adiciones autorizadas por el requisito de idioma/placeholder.

CSS aislado: nunca cambiar globales del piloto para arreglar Azra. Estados: hover, foco visible, seleccionado, deshabilitado, error, carga y estados de token. Modal nativo `dialog` con Escape y foco. Menú móvil limita foco mientras está abierto y se cierra con Escape; sidebar oculto no queda accesible por teclado.

Responsive asumido/documentado al faltar referencias específicas: >=1101 escritorio; 768–1100 sidebar más estrecho, contenido flexible; <=767 menú lateral desplegable, tarjetas y acciones apiladas, padding 16 px. Tabs y futuras tablas pueden desplazarse horizontalmente dentro de su región, nunca desbordar toda la página. Chat pasa su submenú a fila móvil. Futuros formularios en columnas pasan a una columna. Cabecera móvil conserva idioma, acceso IA y perfil. No hay footer en las capturas aportadas; no crear uno.

## Estado de páginas y componentes

El mapa completo con **cada ruta y captura** está en `docs/design/azra/INVENTORY.md` y en `routes.ts`; todos los paths empiezan en `/azra`.

| Elemento                                                                  | Estado                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Rutas, manifiesto de 40 capturas, shell, ES/EN                            | DONE para Stage 1                                                        |
| Sidebar/header, componentes de modal/formulario/estados, adaptación móvil | DONE funcional; fidelidad final IN PROGRESS                              |
| Selector de cuenta #21 + capturas chat                                    | DONE demo: anclado, vacío inicial, crear → plantilla, pin persistente    |
| `/agency` #2                                                              | DONE estructura/fidelidad demo; ilustración, logo Stripe y API pend.     |
| Shell: sidebar/cabecera                                                   | DONE textos GHL-ES, insignias, traducir ES/EN, colores; fuente pend.     |
| `/ai/chat` #1                                                             | DONE: Gemini real (/api/ask); voz/adjuntos/buscar deshabilitados         |
| `/settings/integrations` #24                                              | DONE demo vacío; abre último detalle si ya existe                        |
| `/settings/api-keys` #27                                                  | DONE demo vacío/enlace; ilustración pendiente                            |
| `/settings/integrations/new` #29–32                                       | DONE funcional demo; verificación visual fina pendiente                  |
| `/settings/integrations/[id]` #28                                         | DONE funcional demo; proveedor real y fidelidad final pendientes         |
| Prospección: accounts, ai, report-builder, analytics, settings            | DONE demo funcional; ilustraciones, widgets, agente y datos reales pend. |
| `/settings/profile/general` #6                                            | DONE funcional demo; avatar solo vista previa de sesión                  |
| `/settings/profile/security` #7                                           | IN PROGRESS: UI/validación lista; backend de auth pendiente, sin éxito   |
| `/settings/company` #8                                                    | IN PROGRESS: datos básicos demo; catálogos y otras pestañas pendientes   |
| `/settings/users` #9                                                      | DONE funcional demo: filtros/búsqueda/paginación; añadir sin diálogo     |
| `/settings/workflows` #10 + `/settings/workflows/subaccounts` (video)     | DONE demo: creador por defecto y por subcuenta (WorkflowService)         |
| Empresa: marca blanca, avanzada, SSO, dirección, funciones (video)        | DONE demo; JS/CSS solo guardados; DNS/SSO/soporte sin backend            |
| `/settings/announcements` #20 (+ video)                                   | DONE demo: 22 avisos legibles, filtros, orden, candados                  |
| Seguridad 2FA (video)                                                     | UI lista; acción «no conectado»                                          |
| Teléfono                                                                  | NOT STARTED contenido; rutas/avisos listos                               |
| Email services/subaccounts/risk/bounces/postmaster/advanced               | NOT STARTED contenido; rutas/tabs/avisos listos                          |
| System-email templates/settings, announcements                            | NOT STARTED contenido; rutas/tabs/avisos listos                          |
| Workflow premium/external-ai, domain-purchase                             | NOT STARTED contenido; rutas/avisos listos                               |
| Affiliates, menu-links, audit logs/exports, storage                       | NOT STARTED contenido; rutas/tabs/avisos listos                          |
| Tablas, filtros de tablas, gráficos y formularios de esas áreas           | NOT STARTED                                                              |

Flujo de credenciales: Claves API → Crear → Información → Permisos → Crear → Modal con valor demo copiable → Detalle. Menú de detalle: rotar/editar permisos/revocar. Nuevo token pendiente y anterior activo coexisten siete días. Cancelar revoca el nuevo y conserva anterior; expirar anterior promueve nuevo; revocar integración invalida todos. Al cumplirse siete días, leer el servicio expira anterior/promueve nuevo. UI refresca cada 30 s y escucha cambios de almacenamiento.

## Datos y frontera del servicio

`CredentialService`: `list`, `get`, `create`, `updateScopes`, `rotate`, `cancelRotation`, `revokeToken`, `revokeIntegration`. Componentes solo usan ese contrato. Para Azra/HighLevel: implementar adaptador detrás del mismo contrato y cambiar la fábrica en `service.ts`; conservar la UI. Normalizar DTOs/errores del proveedor en el adaptador. La validación que exige prefijo DEMO pertenece al almacenamiento demo; no aplicarla a respuestas reales futuras.

Demo guarda `azra:credentials:demo:v1` en localStorage. Cada token comienza `DEMO-NOT-A-CREDENTIAL-`; nunca da acceso real. Nombre 1–200 tras trim, descripción <=500, al menos un permiso conocido, deduplicación. Esquema versionado; fallo de almacenamiento/corrupción no borra datos ni anuncia éxito. No usa `data/`, no llama APIs. Idioma: `azra:locale`, con fallback de sesión si almacenamiento falla. Formularios sin guardar, pin y colapso son de sesión.

Ocho permisos legibles: `companies.readonly`, `locations.write`, `locations.readonly`, `saas/company.read`, `saas/company.write`, `saas/location.read`, `saas/location.write`, `snapshots.readonly`. La captura dice 24, pero no muestra los otros 16: aviso explícito y selector de 8; nunca inventarlos.

`AccountService`: `get`, `updateProfile`, `updateCompany`, `listUsers`, `changePassword`, `signOutEverywhere`. Demo en `azra:account:demo:v1`, empieza vacío (sin personas ni empresa sembradas); número de relación `DEMO-###-###`; el único usuario es el propietario derivado del perfil guardado. Guardar perfil aplica su idioma a la UI y el avatar de cabecera usa sus iniciales. Contraseña/sesiones siempre rechazan con `notConnected`. Corrupción → error, nunca sobrescribe. Subcuentas: `listSubaccounts`, `createSubaccount({name, snapshot})`, `setPinned`; esquema tolera almacenes previos sin `subaccounts`; nombres duplicados → `duplicate`. Catálogo de plantillas en `model.ts` solo con las 4 legibles. Supuestos (país 9 códigos, Creativo/Otro únicos visibles, nicho deshabilitado, botón Guardar de empresa provisional por recorte, «HighLevel» neutralizado) en DECISIONS.

Las otras áreas aún NO tienen modelos/servicios. Sus dependencias exactas están clasificadas en INVENTORY. Crear contratos por dominio cuando se implemente la pantalla; no habilitar acciones externas con datos inventados.

## Decisiones autónomas y por qué

1. Reutilizar Next instalado y aislar `/azra`: proteger el piloto con datos reales y evitar dos proyectos divergentes.
2. No tocar autenticación, exportación o redes del piloto: esta nueva base tiene solo datos demo.
3. Demostración de credenciales en navegador: permite validar todo el ciclo sin proveedor ni secretos. No es almacenamiento de producción.
4. Rutas legibles sin prefijo de idioma: las capturas no definen URLs; cambio de idioma conserva ruta.
5. No copiar imágenes con secretos; registrar nombres originales y usar marcadores de asset faltante.
6. Reutilizar el selector de permisos en un modal de edición y añadir las operaciones solicitadas al kebab. Su contenido abierto no aparece en la captura: comportamiento provisional documentado, sin otra página inventada.
7. Entrada a integraciones retoma el último detalle; volver desde detalle va a Claves API (#27). No hay captura de listado poblado. Múltiples integraciones conservan URL, no tienen listado nuevo.
8. Dos pasos de continuación: Stage 2 pantallas/frontends + servicios demo; Stage 3 adaptadores reales cuando estén definidos. Separarlos evita confundir controles funcionales demo con integraciones operativas.

## Pendiente del propietario — no bloquea el frontend

- **Credenciales propias de Azra o HighLevel**, contrato/API/tenancy/roles y semántica definitiva de expiración/revocación. Mantenerlo pendiente; NO pedir decidir antes de construir UI.
- Catálogo completo de 24 permisos; los 16 no visibles no se inventaron.
- Logo, ilustraciones originales, familia/pesos de fuente y referencias sin recortes/tapados; validación de identidad Azra frente a ezrá histórico.
- Datos reales de empresa/perfil/usuarios/cuentas, plantillas y términos/enlaces de afiliados. No tomar 40 % como condición comercial confirmada.
- Proveedores y contratos de Stripe, correo, teléfono, dominios, IA, auditoría y almacenamiento; claves solo mediante configuración segura cuando corresponda, nunca por chat.
- Cualquier destino sin captura necesita referencia antes de desarrollar su pantalla.
- Política de autenticación/aislamiento para Azra antes de conectar datos reales. Reutilizar lo adecuado del piloto, no asumir que compartir layout proporciona autorización.

## Verificación y límites conocidos

Verificación funcional ya realizada: 46 pruebas unitarias (7 nuevas), lint y tipos; build; 5 integraciones HTTP del piloto. Navegador: creación, selección/edición de permisos, modal, persistencia, rotar, cancelar, expirar anterior y revocar integración tras recarga; ES/EN; Escape de menú móvil; formulario a 390 px sin desbordamiento (scrollWidth 390), escritorio 1440 px. Evidencia: `work/azra-validation/mobile.jpg` y `desktop.jpg`. Solo datos demo de prueba; nada enviado a terceros por este flujo.

Limitaciones explícitas: fidelidad exacta no certificada; fuente/assets pendientes. Solo ocho permisos. Demo localStorage no sincroniza de forma transaccional modificaciones simultáneas de dos pestañas; no usar como backend real. Token demo inicial se copia en modal; al cerrar queda oculto en detalle y se puede rotar. No hay listado poblado aportado ni exportación de credenciales. Histórico de tokens cancelados queda almacenado pero oculto mientras la integración está activa. Los resultados de datos/servicios reales no se han probado. El idioma se hidrata desde español antes de restaurar preferencia inglesa. Pin/collapse no persisten al recargar.

Stage 2 cuenta (2026-10-06): `npm run check` 50/50 (4 nuevas), build y 5/5 integración. Navegador headless (Chromium de Playwright en caché vía CDP; la extensión de Chrome no estaba conectada): errores de validación, guardado de perfil con cambio a EN, usuario derivado y búsqueda sin coincidencias, contraseña/sesiones con aviso «no conectado», empresa con URL inválida y guardado; 1440, 900 y 390 px sin desbordamiento (tabla de usuarios desplaza dentro de su región). Evidencia solo en el scratchpad de la sesión; no se compararon píxeles certificados.

## Próximos pasos, en orden

1. Leer `docs/design/azra/NEXT_STEPS.md` y revisar git diff; confirmar que nadie más escribe.
2. ~~Perfil/empresa/usuarios~~ hecho. Pendiente ahí: catálogos completos de categoría/nicho/uso, diálogo de añadir usuario, pestañas marca blanca/avanzado/SSO (sin captura), almacenamiento de avatar.
3. Continuar prospección (#3–5, #38–39), componentes de tablas/filtros y formularios compartidos, luego workflows/phone/email/system-email/announcements/domains/affiliates/menus/audit/storage según INVENTORY.
4. Validar cada módulo en ES/EN y móvil, actualizar estado en routes.ts/INVENTORY/CLAUDE/TASKS al cerrar cada pieza. No declarar DONE solo porque la ruta existe.
5. Completar fidelidad contra originales cuando estén assets/fuente. Conservar referencias por pantalla.
6. Stage 3: conectar servicios autorizados mediante adaptadores, autenticación/aislamiento y pruebas con almacenamiento de prueba; mantener frontend operativo demo mientras falten dependencias.

## Cierre de esta sesión

Última pasada sobre el código final: `npm run check` correcto (46/46), `npm run build` correcto, `npm run test:integration` correcto (5/5), `git diff --check` sin errores. No se hicieron commits ni despliegues. Se dejaron los cambios locales para revisar. Los cambios preexistentes del piloto y su documentación siguen en el árbol de trabajo; no atribuirlos a Azra ni revertirlos.

Se detuvo después de completar y verificar las prioridades de Stage 1 y escribir INVENTORY/NEXT_STEPS. Actualización 2026-10-06: módulo de cuenta (#6–#9) implementado y verificado; sidebar sin las 8 secciones descartadas. Después: tablero y shell ajustados a las capturas nuevas del propietario (52/52, build, 5/5; headless 1440/390 sin desbordamiento; crear subcuenta, pin, Escape, idioma). Prospección hecha después (55/55, build, 5/5; headless 1440/900/390). Videos/capturas nuevas del propietario: si llegan, revisarlas antes de seguir (ffmpeg disponible para extraer fotogramas; la grabación anterior estaba en una carpeta temporal inaccesible). El siguiente cambio de código es workflows #10 / teléfono #11 / correo #12–#17. Empezar por inspeccionar #10 y #11; extraer de `account/users.tsx` tabla/filtros/paginación a un módulo compartido cuando teléfono (#11) los reutilice. Ninguna clave o decisión externa bloquea ese siguiente paso.


## Cierre verificado · Granjas · 27 de octubre de 2026

La interfaz de Granjas está integrada en el estudio: recetas, lienzo de agentes, conexiones entre pasos, inspector, encargos vinculados, ejecución manual, revisión y vista previa. Se conserva el código reciente del otro editor; no se sobrescribió el backend de Claude ni la integración concurrente. Conexiones incluye Instagram, Facebook, TikTok y Spotmi, con requisitos y estados reales; una tarjeta visible no acredita una cuenta conectada.

Verificación final de la versión integrada en copia aislada: `npm run check` pasó (lint, TypeScript y 82 pruebas); build con Webpack y `EZRA_DIST_DIR=.next-verificar` pasó; integración HTTP pasó 7/7, incluidas autenticación, roles y Granjas. Navegador a 1440 px: lienzo e inspector visibles; Alt+flecha y Guardar comprobados. A 390 y 360 px, ancho de documento igual al viewport y sin claves g_* visibles. La regla CSS de movimiento reducido se revisó; no se emuló la preferencia del sistema. La build temporal y los servidores de QA se retiran al cerrar.

La comprobación local adicional del encargo `ae58cf22-6697-497a-8b95-5a26cc2c3f41` creó la granja `baa6585d-ee21-4ccf-be0b-67532e722216` («Primera prueba · Instagram»), ejecución `6d697f57-e00f-40a7-9699-0e85eae7d6ec` y pieza `f4470a71-bd41-450c-84d6-808ba36c9cd8`. Se leyó la ficha oficial (HTTP 200), se importó el encargo y se preparó el texto manualmente. Estado: esperando al dueño, 0 autorizaciones y 0 recibos. No se ejecutó IA, no se subieron medios y no se publicó. Informe: `work/primera-prueba-granjas-real.json`. La granja preparada antes por Claude se conserva también; no se borraron datos.

Los registros de la app viven en `data/granjas/granjas.sqlite`; medios en `data/granjas/medios`; encargos previos en `data/produccion-spotmi.json`. No es almacenamiento remoto ni una subida a Spotmi. La migración y sus ataques están preparados en spotmi-web (`20261103_propuestas_ezra.sql` y `supabase/tests/propuestas_ezra.sql`), SIN aplicar ni ejecutar; falta validarlos en una base aislada. No se regeneraron tipos de una migración sin aplicar.

Pendiente externo: conectar y comprobar cuentas reales y permisos, contrastar el anuncio original de Instagram, aportar imagen autorizada si el canal la exige, y aprobación explícita del contenido exacto y de cada cuenta. TikTok queda en envío de borrador y exige video. Spotmi exige migración aplicada y cuenta editorial habilitada. Gemini y servicios de pago no se activaron; no hubo push, merge ni despliegue.

Matriz de capacidades y uso: `docs/GRANJAS_CAPACIDADES.md`. Contenido exacto: `docs/relevos/granjas-spotmi-20261027/PRIMERA_PUBLICACION.md`. El siguiente paso del propietario es revisar ese texto y elegir cuentas; ninguna aprobación documental sustituye la autorización por versión y destinos en la app.
