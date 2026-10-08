# Estado y relevo

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
- [ ] Confirmación del propietario para borrar el acceso `rafasanguti11@gmail.com` (Sgmotos).

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
