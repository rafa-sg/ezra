# Decisiones

## 2026-10-07 · Interacción y movimiento del panel

- Una sola capa CSS (`motion.css`) con variables reutilizables: duraciones 140 ms (hover), 210 ms (paneles y vistas), halo 220 ms al entrar y 360 ms al salir, curvas `--az-ease`/`--az-ease-out`, colores de hover/presionado, anillo de foco y sombras. Sin `transition: all`, sin JavaScript de animación ni dependencias.
- Hover solo en dispositivos con puntero real (`hover: hover` y `pointer: fine`); en táctiles se anulan los hover heredados para evitar estados pegados y queda la respuesta al presionar.
- La sección activa se marca con fondo lila, texto violeta y una barra lateral (no solo color); el hover de otra opción no la borra ni cambia tamaños.
- Modo compacto: íconos en la misma posición expandido/compacto (relleno de 22 px), etiquetas ocultas visualmente pero legibles por lectores de pantalla (antes `display: none` + `title`), tooltips CSS al pasar el cursor o con foco. No se agregó expansión por hover.
- Diálogos con `@starting-style` y `allow-discrete` (Escape y foco nativos intactos; en navegadores sin soporte abren sin animación). El selector de cuentas entra desde la barra lateral.
- Las vistas solo animan su contenido al montarse (opacidad + 4 px); la barra superior y la lateral no se mueven y la navegación no espera a la animación. Con `prefers-reduced-motion` no hay animaciones ni desplazamientos.
- Los botones deshabilitados de la barra superior ahora se ven atenuados.

## 2026-10-07 · «Spotmi» y formulario de Empresa

- El nombre visible de un negocio vive en `data/businesses.json`; se cambió solo `owner-main` («Mi negocio» → «Spotmi») y la marca de su workspace, sin tocar el archivo histórico `spotmi` ni la semilla de instalaciones nuevas.
- «Para quién» y «para qué» son preguntas separadas; categoría y nicho salen de un catálogo tipado compartido. Son preferencias que no habilitan funciones.
- Registros guardados con valores viejos se migran explícitamente al leerlos («Creativo» → «Arte, diseño y creatividad»; uso principal → objetivo principal); nada se descarta en silencio.

## 2026-10-07 · Bot de atención

- Datos del bot en `bot.json` propio por negocio, no dentro de `workspace.json`: Creación de contenido guarda el workspace completo con revisión optimista, y mezclar ambos provocaría conflictos 409 entre pestañas. Se incluye en el respaldo ZIP del negocio.
- Motor de simulación determinista y sin proveedor: el simulador no llama a Gemini ni a ninguna IA. Sus respuestas se rotulan como simuladas.
- Reglas obligatorias fijas antes de las reglas del usuario: derivar pedidos de persona, reclamos, pagos y temas restringidos; no inventar; aclarar cuando falta información (segunda vez, derivar). El texto del cliente nunca cambia reglas.
- Sin reglas habilitadas, el bot no responde con conocimiento. Reglas nuevas o editadas quedan desactivadas hasta una prueba en la que se apliquen.
- Editar conocimiento aprobado lo devuelve a borrador; fecha de revisión vencida lo excluye. No se copian catálogo, precios ni horarios: solo un botón para copiar la descripción de Marca a un borrador.
- Conexiones: un solo panel compartido; GHL y cada canal tienen estados independientes; hoy solo se muestra lo verificable («Sin conectar»). No se asume que el MCP de GHL reciba eventos o mantenga un bot activo.
- Horarios en America/El_Salvador; horario del bot separado del horario del equipo.

## 2026-10-07 · Configuración reducida

- Configuración conserva Mi perfil, Empresa y Usuarios; el resto se eliminó del código y sus URLs redirigen a Mi perfil (pedido del propietario).

## 2026-10-07 · Herramientas de contenido: Conexiones

- A petición del propietario, el lateral de Creación de contenido ahora contiene solo «Conexiones». Nuevo chat, Buscar, Plantillas y Personalizar se retiran de esta pantalla; el apartado de IA no cambia.
- Conexiones abre un diálogo para el futuro MCP de GHL, explícitamente pendiente de configurar. No se agregan credenciales, llamadas externas ni conexiones simuladas. Se conserva la creación de paneles locales y todo el contenido guardado.
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

## 2026-10-07 · Ask AI con Gemini

- Gemini solo desde el servidor (`/api/ask`) con el SDK oficial; la clave se lee de `GEMINI_API_KEY` en cada solicitud y nunca llega al navegador. Modelo configurable con `GEMINI_MODEL`, por defecto el Flash-Lite estable vigente (`gemini-3.5-flash-lite`).
- Respuestas solo desde herramientas de solo lectura sobre el workspace del negocio autorizado. Sin archivo estático de contexto. Campos mínimos; sin textos completos, correos ni teléfonos. Publicaciones `demo` excluidas.
- Métricas y mensajes no existen en la app: las herramientas lo declaran «no conectado» en lugar de estimar.
- Fechas en America/El_Salvador (no hay zona por negocio en el modelo); «esta semana» = lunes a domingo.
- Límites para el plan gratuito: 5 preguntas/min por cuenta (en memoria, servidor local único), ≤4 llamadas al modelo por pregunta, `maxOutputTokens` 800, historial ≤20 turnos.
- La conversación vive en memoria del navegador y se reinicia al cambiar de negocio, para no mezclar datos de dos negocios.

## 2026-10-06 · Spotmi automation design scope

- Owner feedback: the visual design is not approved. The owner requested a screen-by-screen explanation and more control over its appearance. The sidebar now stays within viewport height, with its own navigation scroll and compact footer on short screens; further visual changes remain proposals.

The owner requested a reviewable design for authorized information collection, branded creative generation, and automatic inbound customer replies on Instagram, Facebook Messenger, and WhatsApp. This is the future product direction; the current request authorizes design and local simulation only, not external activation, paid services, publication, or messaging.

- Spotmi is the first design case. Its historical archive and the existing commercial workspaces remain preserved.
- The proposal lives in `docs/design/spotmi/`. The separate browser prototype uses explicitly labeled sample data and its own localStorage key; it does not read or write `data/`, production APIs, or credentials.
- Production collection remains subject to the current source restrictions until a specific implementation phase changes them. Future scheduled collection, social ingestion, and live reply modes need their own server-side capabilities and activation conditions.
- Routine bot replies will run automatically from approved business knowledge. Human handoff is required for unknown/stale facts, complaints, payments, availability, and explicit requests for a person. Taking over a conversation must stop concurrent bot replies.
- Orshot is a candidate renderer, Apify a bounded collection adapter, and official Meta APIs the messaging transport. An information-source URL is never an authenticated account connection.
- Existing uncommitted changes in `studio.tsx`, `studio.css`, and `next-env.d.ts` predate this design task and are preserved.

## 2026-10-04 · Base local

- Next.js + TypeScript. CSS convencional con variables, en lugar de Tailwind: reduce dependencias y mantiene un sistema visual explícito en este prototipo. No altera la arquitectura futura.
- JSON en `data/workspace.json` para una única persona. Escritura atómica, validación Zod, revisión optimista y cola de escritura en un único proceso. No es una base multiusuario ni apta para despliegue serverless.
- Medios en `data/media/`, fuera del repositorio. Respaldo ZIP descargable con manifiesto y archivos. Git guarda código/documentación, no contenido privado.
- Servidor limitado a 127.0.0.1 y comprobación de origen para mutaciones. No exponerlo con túneles ni desplegar sin autenticación.
- Proveedor IA y publicación desconectados. Generación manual en herramientas existentes; no usar API ni facturación.
- Fuentes se registran manualmente; no hay rastreo. Métricas solo internas: borradores, revisiones y fechas previstas.
- Las ilustraciones incluidas son SVG originales y se etiquetan como referencia; no representan fotografías verificadas de destinos.

## Futuras decisiones

- Verificar Meta oficialmente: producto/login, cuenta profesional, permisos, roles de prueba, revisión, formatos y tokens antes de elegir la integración.
- Supabase gratuito es candidato; verificar cuotas vigentes y respaldo. No contratar Pro dentro de USD 20.
- Antes de APIs pagadas: estimación basada en volumen, registro de consumo y bloqueo desde servidor, no solo aviso visual.
- Publicación desatendida requiere ejecutor disponible sin el Mac, reintentos controlados y protección contra duplicados.

## 2026-10-04 · n8n como motor de automatización

El usuario confirmó que las integraciones y automatizaciones se implementarán con n8n. ezrá conserva interfaz, publicaciones, medios, reglas, aprobación, presupuesto e historial. n8n coordina tareas y llamadas a proveedores a través de una API dedicada de ezrá; no escribe directamente `data/workspace.json`.

Primera fase futura: n8n Community local y flujo de prueba sin llamadas pagadas ni publicación real. Una prueba completada devuelve un resultado marcado como simulado. Después: fuentes permitidas, propuesta de borrador, generación opcional y publicación aprobada en cuenta propia. La ejecución real requiere verificar permisos de Meta, medios accesibles y consumo del proveedor. n8n no sustituye esos requisitos.

No está instalado ni conectado en el hito actual. Ver `docs/N8N_ARCHITECTURE.md` para contrato, aprobaciones, reintentos y límites de licencia antes de ofrecer el servicio a empresas.

## 2026-10-04 · Lado de ezrá para la prueba simulada de n8n

Aprobado por el usuario. n8n sigue sin instalar ni conectar.

- `contentRevision` = hash SHA-256 de `editorial(post)`, las fuentes vinculadas y la marca. Se calcula al crear el encargo; no se guarda en la publicación ni cambia el esquema. Es una huella, no un contador: la futura autorización real también debe comprobar el estado de aprobación.
- Encargos en `data/automation.json`, con Zod y la misma cola de escritura que `workspace.json`. Se incluye en el respaldo ZIP. `schemaVersion` y el PUT de `/api/workspace` no cambian.
- `POST /api/automation/jobs`: ruta local de la interfaz (proxy de loopback y origen). Guarda el encargo antes de enviarlo y lo envía a `N8N_WEBHOOK_URL` con la cabecera `x-automation-secret` = `EZRA_TO_N8N_SECRET`. Solo acepta `action: "connection_test"` y `mode: "simulation"`. La URL debe ser local; tiene un límite de 5 s y no sigue redirecciones. Estados: `queued` → `sent` | `delivery_failed` → `completed` | `failed`.
- `POST /api/automation/results`: exige `N8N_TO_EZRA_SECRET` en la misma cabecera y compara en tiempo constante. Solo acepta resultados simulados, con `providerId` y `publishedUrl` vacíos. Si `contentRevision` no coincide o hay otro resultado distinto: 409. Un resultado repetido igual devuelve 200 sin nuevo evento.
- Secretos ausentes, de menos de 32 caracteres o iguales entre sí cuentan como no configurados: 503 a todo. El navegador nunca recibe secretos.
- Un resultado solo actualiza el encargo y añade un evento al historial (id fijo `job-<jobId>`, que permite reparar el evento sin duplicarlo). Añadir ese evento no sube `revision`, porque `reconcile` ignora el historial del navegador; así no aparecen 409 en pestañas abiertas. Nunca cambia el estado de una publicación.
- Al reiniciar no se reenvía nada; un encargo pendiente sigue aceptando su resultado.
- n8n en Docker: `proxy.ts` acepta el host `host.docker.internal` solo en `/api/automation/results`, que exige el secreto. Todas las demás rutas siguen siendo solo loopback (probado). Configuración prevista: publicar n8n con `-p 127.0.0.1:5678:5678` (`N8N_WEBHOOK_URL=http://127.0.0.1:5678/...`), y que n8n devuelva el resultado a `http://host.docker.internal:3000/api/automation/results`. El servidor sigue escuchando solo en 127.0.0.1; Docker Desktop para Mac debería reenviar `host.docker.internal` al loopback de la Mac, pero Docker no está instalado y hay que confirmarlo al instalar.

## 2026-10-04 · n8n local instalado

El usuario no tenía n8n y aprobó instalarlo en la Mac, sin Docker.

- n8n Community 2.41.6, con versión fija, en `~/n8n-local`, fuera del repositorio. La caché global de npm tenía archivos de root, así que se usó una caché aparte (`~/n8n-local/.npm-cache`), sin `sudo`.
- `automation/n8n/Abrir n8n.command` lo arranca solo en 127.0.0.1:5678, en la zona horaria de El Salvador, sin telemetría, plantillas, API pública ni paquetes comunitarios.
- Los secretos se generaron al azar en `.env.local` (permisos 600, ignorado por Git). Se importaron en n8n como credenciales cifradas «ezrá → n8n» y «n8n → ezrá», y el archivo temporal se borró.
- El flujo exportado no contiene secretos, solo referencias a esas credenciales. Si recibe algo que no es una prueba simulada, no responde.
- Primera ida y vuelta real verificada: encargo completado, un evento en el historial, publicaciones y `revision` sin cambios. Sin llamar a servicios externos ni generar gasto.

## 2026-10-04 · Metricool Free para programar a mano

Decisión del propietario: evaluar Metricool como herramienta de publicación y métricas para Spotmi, sin gastar. Detalle en `docs/METRICOOL.md`.

- La cuenta está en el plan **Free**, sin prueba activa: 1 marca (`spotmi.sv`) con Facebook e Instagram vinculados, 20 publicaciones al mes y métricas de 30 días.
- Uso manual: ezrá prepara, revisa y aprueba cada versión. Metricool programa a mano la versión exportada y después se registra el enlace real en ezrá.
- No se conecta n8n con Metricool: eso exige la API, disponible solo en Advanced o Custom. El contrato de automatización de ezrá permite añadir Metricool API o Meta como proveedor más adelante sin reescribir la base.
- El MCP de Metricool funciona en Free, pero también puede programar y publicar. Se añadió para evaluarlo y se retiró a petición del propietario; la cuenta se verificó con capturas. Volver a conectarlo requiere su aprobación, y cada escritura un sí explícito.
- No activar pruebas ni planes de pago sin una decisión explícita: las pruebas con código piden tarjeta o PayPal y cobran automáticamente si no se cancelan.

## 2026-10-04 · Envío de eventos de ezrá a spotmi-web como borrador

Aprobada por el propietario tras una investigación en solo lectura del repositorio del sitio (`~/dev/spotmi-web`).

**Excepción al invariante «no publicar en este hito», limitada a esto:** ezrá podrá enviar al sitio de Spotmi un evento con foto, que llega **como borrador no visible** (`events.is_verified = false`). Publicarlo sigue siendo una moderación manual en el sitio. Las redes sociales siguen sin publicación automática. La excepción solo entra en vigor cuando exista el camino (b); el camino (a) no envía nada.

**Condiciones de cualquier camino:**

- solo versiones aprobadas y no demo, comprobado en el servidor de ezrá;
- confirmación explícita del propietario por cada envío, sin envíos automáticos ni en lote;
- cada envío queda registrado como encargo con su resultado;
- las claves del sitio viven solo en credenciales de n8n, nunca en ezrá, Git ni el chat;
- sin `service_role` de Supabase en n8n.

**Caminos:**

- **(a) Activo:** «Exportar para el sitio» genera `evento.txt` con los campos del formulario «Agregar evento» del sitio y la foto, para copiarlos a mano. El formulario del sitio no sube fotos todavía.
- **(b) Pendiente:** endpoint protegido en el sitio que reciba el evento desde n8n con un secreto propio y escriba como una cuenta bot de Supabase, no con `service_role`. Requiere el visto bueno de quien administra el sitio y Supabase (según el repositorio, Josué García; hay que confirmarlo).
- **(c) Descartado:** n8n directo a Supabase, porque el nodo de Supabase pide la clave de administrador total.

**Antes de (b):**

- En las migraciones del sitio, la política de inserción de `events` solo comprueba `created_by`. Nada en la base obliga a `is_verified = false`, así que un usuario con sesión podría publicar sin moderación llamando directamente a PostgREST. Se informó al propietario para que lo traslade al administrador del sitio.
- El bucket `eventos` es público. Hay que decidir si las fotos de borradores van a una ruta o bucket no público.
- Hay que confirmar el dominio del sitio: aparecen `spotmi.com.sv`, `spotmi.sv` y `spotmisv.com`.

## 2026-10-04 · Fase A: fuentes reales e ideas (USD 0, sin IA)

Aprobada por el propietario, con las tres recomendaciones del plan.

- **Tipos de fuente:**
  - sitio propio (`owned`), sitio oficial (`information`), RSS (`rss`, nuevo) y nota manual de inspiración (`inspiration`);
  - la nota puede no tener enlace y nunca se lee ni verifica hechos;
  - no cambia `schemaVersion`; los datos existentes siguen siendo válidos.
- **Lectura:**
  - `AGENTS.md` cambia de «no descargar fuentes automáticamente» a «una lectura por clic del propietario, solo de fuentes autorizadas, respetando robots.txt»;
  - n8n lee solo RSS y el RSS que anuncie un sitio propio; los sitios oficiales sin RSS se consultan a mano;
  - nada de redes sociales ni páginas HTML;
  - se leen como máximo 10 fuentes por clic y 5 ideas por fuente, con un tiempo límite de 6 s por petición;
  - el visitante se identifica como `ezra-spotmi`.
- **robots.txt:**
  - el grupo `ezra-spotmi` manda sobre `*`;
  - si robots.txt no se puede consultar (5xx o error de red), la fuente no se lee y se anota el motivo.
- **Ideas:**
  - se guardan en `data/automation.json` (lista `ideas`), solo con título, enlace y fecha;
  - el «dato breve» queda vacío: lo escribe el propietario o, más adelante, Gemini; no se copian extractos;
  - las ideas nunca cambian publicaciones;
  - «Crear borrador» abre un borrador vacío con el título y la fuente.
- **Defensa:**
  - lo que devuelve n8n se valida con Zod;
  - se aceptan solo enlaces https del mismo sitio que su fuente;
  - se limpian etiquetas y caracteres de control;
  - se descartan duplicados;
  - se muestra como texto.
- **Configuración:**
  - flujo en `docs/n8n/ezra-buscar-ideas.json`, con webhook propio (`N8N_IDEAS_WEBHOOK_URL`, solo loopback);
  - comparte los dos secretos y credenciales de la prueba de conexión.
- **Pendiente para la fase B:** el resumen propio de cada idea con Gemini, con tope de gasto.

## 2026-10-04 · Fase B: propuestas de texto con Gemini

Aprobada por el propietario, con las tres recomendaciones: nivel gratuito, `gemini-3.1-flash-lite` y nota obligatoria.

- **Modelo y precio:**
  - `gemini-3.1-flash-lite`: USD 0.25 por 1M tokens de entrada y USD 1.50 por 1M de salida (ai.google.dev/gemini-api/docs/pricing, página del 2026-10-01);
  - unos USD 0.001 por propuesta;
  - en el nivel gratuito Google puede usar los datos para mejorar sus productos; se envían criterios de marca e ideas públicas, sin datos personales.
- **Tope de USD 5 en ezrá:**
  - cada encargo reserva el costo máximo posible antes de enviarse (8,000 tokens de entrada y 600 de salida, ≈ USD 0.0029);
  - al volver el resultado se registra el costo real;
  - se cuenta el precio de pago aunque se use el nivel gratuito, para que cambiar de nivel nunca quite el tope;
  - Google no corta el gasto por presupuesto, por eso el tope vive en ezrá;
  - un envío que no llegó a n8n no reserva nada;
  - una generación sin respuesta deja de bloquear nuevos clics a los 3 minutos, pero su reserva sigue contando.
- **Una propuesta por clic:**
  - requiere «Tu nota», escrita por el propietario con lo que comprobó, porque la idea solo trae título y enlace;
  - la confirmación muestra qué se envía, el modelo y el costo;
  - si hay una generación en curso, se rechaza otro clic; nada se programa.
- **El prompt:**
  - lo arma n8n (`docs/n8n/ezra-generar-propuesta.json`) con los criterios de marca, la idea y la nota;
  - el título y el enlace de la idea van entre `<idea>` como datos que no deben obedecerse;
  - Gemini recibe la instrucción de no inventar precios, fechas, horarios ni nombres y de marcar lo dudoso con `[verificar]`;
  - el límite es de 600 tokens; n8n solo acepta modelos de su lista.
- **El borrador:**
  - llega como borrador «Generado con IA», con su fuente, y el prompt queda guardado en el encargo;
  - la etiqueta (`post.aiGenerated`) se conserva al editar y el navegador no puede quitarla;
  - nunca se aprueba ni se publica solo;
  - si el texto está vacío o supera 2,200 caracteres, el encargo queda «falló» y no se crea borrador;
  - un resultado repetido no duplica el borrador.
- **La clave de Gemini:** la crea el propietario y la pega solo en una credencial de n8n de tipo cabecera (`x-goog-api-key`), nunca en ezrá, Git ni el chat. No se usa la credencial «Google Gemini(PaLM) Api» porque envía la clave en la dirección web.

## 2026-10-05 · Acceso comercial con Clerk

- El producto activo se orienta a Sgmotos, motoxspress y el panel del propietario; Spotmi queda como archivo histórico.
- Clerk gestiona identidad, contraseña y sesión. `data/access.json` solo guarda la autorización privada del panel y, tras el primer acceso, el `userId` de Clerk. No se guardan contraseñas ni claves en Git.
- La instancia usada es desarrollo. Las tres cuentas de prueba usan correos provisionales y una contraseña débil únicamente para esta prueba local; deben sustituirse antes de cualquier entrega.
- No se habilitaron Organizations de Clerk: el aislamiento actual es una asignación privada de cuentas a organizaciones locales, suficiente para el piloto. Se revisará B2B/Organizations antes de comercializar.
- La publicación social, WhatsApp, chatbot, Gemini y cobros continúan fuera del hito; el flujo actual prepara y exporta manualmente.

## 2026-10-05 · Enfoque en Sgmotos y asistente de publicación desde el catálogo

- Por decisión del propietario, se termina primero el panel de **Sgmotos**; motoxspress queda aislado y sin cambios funcionales propios hasta validar Sgmotos. Después se conectan las redes oficiales de Sgmotos.
- **«Crear publicación» en el catálogo es un asistente de 4 pasos:**
  1. Variante y fotos: solo las fotos del propio producto o variante.
  2. Promoción: vigente, próxima, vencida o incompleta, mostrada desde el catálogo verificado y no editable en el asistente.
  3. Redes: Instagram exige al menos una foto.
  4. Revisión: vista previa del texto exacto por red y avisos (producto sin verificar, sin enlace, sin precio, promoción no vigente).
- Los avisos no bloquean el borrador, porque nada se publica; las mismas reglas se exigen al aprobar.
- El formato sale del número de fotos: sin fotos es texto (solo Facebook), una es foto y varias son carrusel.
- En pantallas de 640 px o menos, los diálogos ocupan toda la pantalla y sus botones quedan fijos abajo.

## 2026-10-05 · Sgmotos: datos de moto y preparación de redes

- **Acceso:** el panel de Sgmotos pasó a otro correo del propietario, a su pedido, porque el correo inicial no estaba verificado. Copia previa de `data/access.json` en `Documentos/Respaldos-ezra/`. El inicio de sesión de administración y de Sgmotos quedó comprobado: las dos cuentas están enlazadas.
- **Producto (`details`), compatible con los datos existentes:**
  - año (si está verificado), cilindrada y especificaciones verificadas;
  - financiamiento, que solo aparece en una publicación si se marca «El negocio aprobó publicar este financiamiento»; no se puede aprobar un financiamiento vacío;
  - estos datos forman parte de la revisión del producto: cambiarlos invalida las aprobaciones.
- **«Preparación para conectar redes» en Ajustes, por negocio (`socialSetup`):**
  - guarda si Instagram es profesional, si está vinculado a la página, si hay control total de la página y qué WhatsApp se usa;
  - muestra qué falta;
  - no conecta, no publica y no envía nada; WhatsApp personal se marca como no conectable.

## 2026-10-05 · Apariencia propia por negocio (Sgmotos)

- **Campo `appearance` por negocio:** color principal, color de acento y logo, compatible con los datos existentes. Vacío conserva el estilo de ezrá.
- **Cómo se aplica:** solo cambian variables CSS (`--violet`, `--violet-dark`, `--lilac`, `--brand-secondary`); la estructura y el comportamiento son iguales para todos.
- **Contraste:** si el color principal no alcanza 4.5:1 con texto blanco, se usa automáticamente un tono más oscuro.
- **Logo:** debe ser una imagen de la biblioteca del mismo negocio, comprobado en el servidor.
- **Sgmotos:**
  - azul `#3070B0` y rojo `#C83020`, medidos sobre su logo;
  - el logo se limpió de las cintas de la bandera y se guardó en su biblioteca como material con autorización del propietario;
  - copia previa de sus datos en `Documentos/Respaldos-ezra/`.
- Los datos comerciales del cliente (marcas que distribuye, ubicación, cuentas) se guardan fuera de Git, en notas privadas; se usan para clasificar marcas, no para inventar especificaciones.

## 2026-10-07 — Azra Stage 1, referencias y credenciales demo

El propietario autorizó construir localmente y avanzar con decisiones documentadas. Se añadió `/azra` dentro del proyecto existente para preservar el piloto `/`. Stack/dependencias conservados; CSS aislado, ES por defecto + EN en diccionarios, manifiesto de 40 capturas y rutas según `docs/design/azra/INVENTORY.md`. No se copian capturas con secretos (#28/#32) a archivos públicos.

Tokens/permisos/rotación/revocación funcionan mediante `CredentialService` y adaptador demo en localStorage, sin llamadas externas ni datos reales. Tokens prefijados `DEMO-NOT-A-CREDENTIAL-`; rotación de siete días, cancelar, expirar/revocar y validar errores. La decisión Azra/HighLevel queda abierta explícitamente y no bloquea el desarrollo. Se implementan ocho permisos legibles; los otros 16 se documentan como pendientes. No hay lista poblada aportada: entrada retoma último detalle, retorno del detalle a Claves API. Edición reutiliza modal de permisos; menú de operaciones es supuesto documentado por el pedido explícito del propietario.

Shell, rutas, traducciones y flujo de credenciales listos como base. Las demás pantallas muestran avisos de Stage 2 pendiente, no se consideran terminadas. Logo/ilustraciones/fuente originales pendientes; no se afirma fidelidad exacta. El relevo activo es `CLAUDE.md` y `docs/design/azra/NEXT_STEPS.md`; el relevo histórico del piloto se conserva. Gasto nuevo: USD 0. No se modificó `data/`, ni autenticación o APIs del piloto.

## 2026-10-06 — Azra Stage 2: menú global reducido y módulo de cuenta

El propietario indicó que no se agregarán Reventa, Complementos, Portal de afiliados, Biblioteca de plantillas, Socios, Universidad, Educación en SaaS ni Swag. Se quitaron del sidebar global (y sus textos), en lugar de mostrarse deshabilitados. No confundir con «Afiliados» de Ajustes (#25/#33), que sigue en alcance.

Perfil general (#6), seguridad (#7), empresa (#8) y usuarios (#9) usan `AccountService` (`src/features/azra/account/service.ts`) con adaptador demo en localStorage `azra:account:demo:v1`. El demo empieza vacío: no se siembra ninguna persona, empresa ni usuario; el único usuario listado es el propietario derivado del perfil guardado. Número de relación generado con prefijo `DEMO-`. Guardar el perfil aplica el idioma de la plataforma a la interfaz. Contraseña y «cerrar sesión en todas partes» validan el formulario pero el servicio siempre responde «no conectado»: nunca aparenta éxito.

Supuestos documentados: selector de país con 9 códigos regionales (solo El Salvador es visible); categoría de negocio y uso principal solo con las opciones visibles (Creativo, Otro); nicho deshabilitado con catálogo pendiente y por tanto no obligatorio aún; botón «Guardar cambios» de empresa provisional porque la captura está recortada; marca blanca, avanzado y SSO son pestañas fuera de alcance; el texto «HighLevel» del campo de uso se neutralizó a «la plataforma»; añadir usuario sin diálogo aportado; eliminar al propietario bloqueado; tamaños 10/20/50 por página. La imagen de perfil se valida (tipo, 2.5 MB) y se previsualiza solo en sesión hasta tener almacenamiento de medios.

## 2026-10-06 — Tablero de la agencia, shell y selector de subcuentas

Referencias nuevas aportadas por chat (no guardadas en el repositorio): GHL en español con selector abierto (#4 chat), búsqueda sin coincidencia con «Crear «nombre»» (#5 chat), «Select Snapshot Template» (#6 chat), tarjeta con hover «Seleccionar y continuar»/«Guía de configuración» (#7 chat) y perfil en español (#8 chat). Contienen datos reales (IdeasForge, dirección, correo, teléfono): no se usan como semilla.

Se adoptó la terminología de GHL en español visible: Tablero de la agencia, Pregúntale a la IA, Instantáneas de la cuenta, Configuración, Volver atrás, «Haga clic aquí para cambiar», insignias «Nueva» doradas, nombres de ajustes con elipsis, «Apellidos» y la indicación de imagen. Los textos sin captura en español siguen con voseo salvadoreño. El selector ES/EN se reemplazó por el botón circular de traducir (morado) que abre Español/English. Colores de cabecera y botón verde de contraer según capturas; estimados, no medidos.

Tablero: estado vacío dentro de tarjeta blanca, título gris, botón «Conectar Stripe» con contorno y deshabilitado; el logo de Stripe y la ilustración siguen como marcadores, sin recrear marcas. El widget «Welcome, <nombre>» de #2 no se reproduce (personal/onboarding sin destino).

Selector de subcuentas: panel anclado al sidebar sin fondo oscurecido, cierra con Escape o clic fuera. La demo empieza sin subcuentas (se retiró «Cuenta de ejemplo»). Buscar un nombre inexistente muestra «Borrar la búsqueda» y «Crear»; «Crear» abre el selector de plantillas. Catálogo solo con las 4 plantillas legibles (en blanco, Accounting Firm, Affiliate Marketing Agency, Appliance Repair Shop); el contador muestra 4, no los 123 del proveedor, y hay aviso de catálogo parcial. Las tarjetas recortadas de la segunda fila no se inventan. «Mis/Importadas» muestran 0 con mensaje vacío. «Seleccionar y continuar» crea una subcuenta demo local (nombre + plantilla, dirección pendiente) y vuelve al selector con aviso: el paso real siguiente de GHL no tiene captura. «Guía de configuración» queda fuera de alcance. El pin persiste en el demo. Elegir una cuenta solo cierra el panel: la vista de subcuenta no tiene captura.

## 2026-10-06 — Prospección (#38, #3, #5, #4, #39)

Módulo `src/features/azra/prospecting/` con `ProspectingService` y demo en `azra:prospecting:demo:v1` (orden/visibilidad del informe, alojamiento, primeros pasos omitidos). Encabezado compartido «Cuentas de prospectos» + «Añadir prospecto» en todas las pestañas: solo #38 muestra la cabecera; la zona central tapada no se reproduce. Pestaña Widgets sin captura: deshabilitada.

Cuentas: estado vacío; filtros Categorías/Origen/Estado y búsqueda deshabilitados hasta que existan prospectos (opciones no visibles). «Añadir prospecto» sin diálogo aportado. Primeros pasos 0/5 siempre abiertos porque ninguna de esas funciones existe; «Omitir» persiste y hay enlace para volver a mostrarlo (adición documentada para no perderlo). Prospect AI: textos y tres tarjetas visibles con ilustraciones pendientes; segunda fila recortada no incluida; crear agente sin editor. Constructor: secciones legibles hasta «Rendimiento del sitio web» (Premium, fija y deshabilitada); casillas con estado intermedio padre/hijos y «Todos»; reordenar arrastrando o con flechas sobre el asa; guardado inmediato (no se ve botón guardar). Analítica: KPIs en 0 y gráficos vacíos porque el demo no tiene actividad; el texto «Se actualiza cada 24 h» se reemplazó por una nota honesta; rangos 3/6/12 meses (solo 6 visible); paleta azul/celeste validada con el validador de dataviz; tooltip por mes y vista de tabla. Ajustes: mapas de calor deshabilitados (premium) con valores visibles; «Mejorar plan» bloqueado (sin compras); alojamiento con los 7 servicios visibles y selección inicial de la captura; «Migrar» sin captura. Insignia tapada junto a «Local SEO Heatmaps» no se infiere.

## 2026-10-06 — Sin «Nueva» en el menú global y sin elementos premium

Por pedido del propietario: se quitaron las insignias «Nueva» del sidebar global (AI Suite, aplicación móvil y de escritorio) y todo rastro de premium (palabra, diamante, bloqueo y «Mejorar plan»). Solo interesa la funcionalidad. «Rendimiento del sitio web» es una sección normal del informe. Los mapas de calor son editables: cuadrícula 3×3/5×5/7×7 y cobertura 3/5/10 km (solo 3×3 y 1.9 mi visibles en #39; el resto es supuesto documentado), con resumen calculado y guardado demo; los ajustes anteriores sin esos campos cargan con 3×3/3 km. Las insignias «Nueva» del menú de Configuración siguen hasta que el propietario indique lo contrario.

## 2026-10-06 — Prospección en español según captura del propietario (imagen 10 por chat)

Se adoptaron los textos visibles de GHL en español: «Añadir cliente potencial», «Todos los clientes potenciales», «Gestione todas las cuentas…», filtros Categorías/Fuente/Estado, «Empiece a explorar nuevos clientes» con su descripción y la pestaña «Estadísticas». Por la regla de no premium se omiten «Sencillo», «5 de los 5 informes prémium…», «Desbloquee Premium» y los diamantes de Widgets/Constructor. El panel promocional «Welcome, <nombre>» / llamada de onboarding no se reproduce: contiene testimonio de una persona real, cifras de clientes y una llamada externa; queda pendiente de confirmación del propietario.

## 2026-10-06 — Etapa 2 según el video del propietario (Configuración)

Fuente: grabación «2026-10-06 11.25.42 p. m.» exportada desde Fotos al scratchpad (no al repositorio; contiene datos reales). Implementado:

- Flujos (#10 + video): creador por defecto estándar/avanzado y página «Gestionar el constructor por defecto por subcuenta» con búsqueda, selección en lote, control segmentado y paginación. `WorkflowService` demo (`azra:workflows:demo:v1`), usa las subcuentas demo.
- Seguridad: sección 2FA; «Configurar» responde «no conectado» (sin backend de autenticación).
- Empresa: pestañas funcionales. Detalles básicos con Cancelar (confirma el botón Guardar antes provisional), dirección (país, zona horaria de `Intl`), funciones con interruptores (Configurar enlaza a sus pantallas; «Más información» externo fuera). Marca blanca: logotipo con vista previa local, dominios de marca blanca/API validados y guardados como «pendiente de DNS», URLs de políticas, JS/CSS personalizados **solo guardados como texto, nunca ejecutados**, tema claro/oscuro guardado (tema oscuro de UI pendiente). Avanzada: seguridad mejorada, interrupción de sesión (4 h–3 días/Nunca; la opción entre 8 h y 1 día estaba tapada, se asumió 12 h), acceso de soporte de 90 días con ampliar/revocar y modal, interruptores de experiencia con modal «No se recomienda deshabilitar…» y casilla obligatoria. SSO: «Habilitar SSO» informa que falta proveedor de identidad. Se omite «Biblioteca de plantillas para clientes» (sección excluida por el propietario) y la palabra prémium.
- Avisos (#20 + video): 22 avisos legibles (sin los de reventa), pestañas por prioridad, búsqueda, orden por columna, interruptores (bloqueados con candado no cambian), paginación. Añadir/editar avisos sin captura. El demo no envía avisos.
- Los ajustes de empresa se guardan combinando cada sección con datos recién leídos para que ninguna sección pise a otra.

## 2026-10-07 — Migración: estructura nueva + identidad y lógica del piloto

El propietario decidió que la estructura nueva gana en layout/navegación/pantallas y la interfaz anterior gana en identidad (nombre «ezrá.», paleta blanca/lila exacta del piloto) y en lógica (Clerk, sesiones, protección, API, validaciones). Negocios del piloto = subcuentas; sidebar blanco con lila. Respaldo en `backup/pre-migracion-ezra-2026-10-06` (`a607921`). Fase 1 hecha: tokens y marca, protección server-side de `/azra` con `sessionAccount()` (solo admin), correo y cerrar sesión, selector y flujos con negocios reales vía `/api/businesses`. Nada del piloto se eliminó; detalle de lo conservado/adaptado/reemplazado/pendiente en CLAUDE.md.

## 2026-10-07 — Logo de agencia persistente

El propietario pidió que el logo de Marca Blanca se guarde. Se guarda en el servidor local (`data/agency/`) con la lógica del piloto: solo administración, detección por contenido (PNG/JPG/WebP, 2,5 MB), cola de escritura y escritura atómica. Sustituye al ícono por defecto en el sidebar. SVG no se acepta (riesgo de scripts). Las pruebas usan un directorio aislado en `work/`.

## 2026-10-07 · Panel nuevo por empresa y comando Claudeya

El propietario confirmó: mismo diseño que la cuenta administrativa rafasanguti69, pero datos y permisos diferentes por empresa. No autoriza acceso administrativo a clientes.

- `Studio` usa por defecto `AzraShell` compartido con opciones de negocio. El panel anterior y `Overview` quedan conservados detrás de `legacyPanel`, desactivado por defecto y sin ruta/query pública para activarlo. No se duplicó ni migró `data/`.
- Inicio nuevo en `src/features/azra/business-overview.tsx`: catálogo, pendientes, fechas previstas y publicaciones reales del negocio. Redes explícitamente sin conectar. Se conserva la lógica de catálogo, revisión, biblioteca, agenda, fuentes, marca, exportación y respaldo.
- Cada empresa usa su propio logo; la apariencia del panel usa la paleta compartida blanco/lila. Los colores personalizados guardados no se borran pero ya no cambian el shell. Los clientes no montan el selector administrativo ni leen el logo/perfil demo del administrador. Avatar derivado de la sesión.
- Administración sigue protegida en `/azra`; clientes permanecen en `/` con el shell nuevo. El selector de negocios sigue limitado por la API. Sin nuevas conexiones, mensajes ni publicaciones.
- «Claudeya» queda definido en AGENTS.md como comando para actualizar CLAUDE.md y TASKS con el relevo completo, sin secretos, y entregar un mensaje listo para Claude Code.
- Ideas del foro seleccionadas para fases posteriores: plantillas/colores/logo; valores de catálogo para contenido; asistencia de texto; conocimiento aprobado para bot y respuestas sugeridas; workflows solo tras verificar permisos reales de GHL. Esta tarea implementa el panel, no esas integraciones.

## 2026-10-07 — Revisión visual de Sgmotos/motoxspress y función 1 del foro

Revisión con arnés aislado (datos en `work/`, Clerk offline). Corregidos: «publicaciónl» → «historial», mes de Agenda en mayúscula de oración, buscadores legibles, piso de 12 px para textos del piloto dentro del shell (sin tocar `studio.css`) y botón de cerrar sesión compacto en móvil. Aislamiento verificado por HTTP para ambas empresas. Plantillas de marca: especificación en `docs/features/plantillas-de-marca.md`; no se implementa hasta que el propietario decida imagen o texto, uso de colores, quién edita, marcadores permitidos y sincronización con GHL. GHL Design Kits API documentada públicamente; scopes, token y plan sin confirmar: no se integra.

## 2026-10-07 — Nuevo login

Estructura de la referencia del propietario (panel dividido + tarjeta centrada) con identidad ezrá (violeta del piloto, logo, tuteo como el login anterior). Clerk conserva toda la lógica; solo cambian apariencia y textos. Aviso de desarrollo oculto con la opción oficial de Clerk; marca «Secured by Clerk» se mantiene. En móvil se priorizó el formulario ocultando los tres puntos.

## 2026-10-07 — Menú del panel: solo «Pregúntale a la IA»

El propietario decidió empezar la funcionalidad real por Ask AI. El menú principal de `/azra` queda con un solo elemento y Ask AI es la página de inicio y el destino tras el login. Se borraron el tablero de la agencia (Stripe), Prospección completa y sus textos/estilos; las URLs viejas redirigen a Ask AI. Elementos sin página (AI Suite, Launchpad, Subcuentas, Instantáneas, Ideas, apps) solo se quitaron del menú. El selector de cuentas, Configuración y la barra superior no cambian. Todo lo borrado se puede recuperar del commit de respaldo `a607921`.

## 2026-10-07 — Un solo panel; estudio eliminado

El propietario eligió eliminar del código las funciones del estudio (Resumen, Catálogo, Publicaciones, Agenda, Fuentes, Marca y criterios) y usar un único panel con «Pregúntale a la IA» para todas las cuentas. Clientes solo ven su perfil en Configuración; el selector de cuentas elige el negocio activo de Ask AI. APIs y librerías del servidor se conservan (lógica y datos), `data/` intacta. Respaldo en `0767994` / `backup/pre-eliminar-estudio-2026-10-07`. Consecuencia: hasta que Ask AI funcione, los clientes no tienen pantalla para ver o preparar contenido.

## 2026-10-07 — Login arcade EZRA

Se rediseñó el login existente (sin pantalla ni app paralela) con el panel arcade de la referencia del propietario y el formulario de Clerk restilizado. Se omitió el aviso de «demo sin autenticación» porque la autenticación es real. El juego es opcional, accesible, solo capta teclado con el panel enfocado y se desactiva con movimiento reducido o poco espacio (móvil).

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

## 2026-10-27 · Granjas: almacenamiento, trabajador y publicación

- Las granjas usan SQLite integrado en Node (`node:sqlite`, sin dependencias nuevas) en `data/granjas/`. Una cola en un JSON por proceso no protege a un trabajador en otro proceso; SQLite con WAL y transacciones inmediatas sí. Los encargos siguen en `produccion-spotmi.json`: la granja los vincula por id y versión, sin migrarlos ni cambiar su esquema.
- El trabajador corre dentro del servidor de Next (`src/instrumentation.ts`) y también como `npm run granjas:trabajador`. Los arriendos permiten recuperar trabajos si el proceso se corta. Un envío a una red interrumpido queda «desconocido» y nunca se repite a ciegas.
- Las invariantes de AGENTS.md se actualizan solo en esto: se puede publicar, pero únicamente por el trabajador, tras aprobar el contenido de una huella concreta y con una autorización explícita (`PUBLICAR`) ligada a esa huella y a cuentas concretas. Ningún modelo puede aprobar, elegir cuentas ni llamar a un publicador.
- Las fuentes de una granja se leen en el servidor solo en dominios permitidos. Se bloquean redes privadas al conectar, se revisan las redirecciones y se respeta robots.txt. Se guardan extractos breves y fechas encontradas, no textos completos ni imágenes ajenas.
- TikTok: la publicación directa queda bloqueada por política (no acepta herramientas internas para cuentas propias); solo se suben borradores. Instagram con inicio de sesión de Instagram publica Reels por subida directa; las imágenes necesitan un enlace público, que esta Mac no expone. Facebook publica en una Página con tarea CREATE_CONTENT. Graph `v26.0` configurable.
- Spotmi web: Ezra solo crea propuestas pendientes mediante una RPC (migración `20261103_propuestas_ezra.sql`, preparada en spotmi-web y sin aplicar). Publicar en Spotmi sigue siendo decisión del equipo.
- La pestaña visible «Producción» pasa a llamarse «Granjas». Las rutas, los esquemas y el archivo de encargos conservan sus nombres.
- `next.config.ts` acepta `EZRA_DIST_DIR` para compilar y probar en `.next-verificar` sin pisar el servidor de desarrollo. Tras compilar, `next` reescribe `tsconfig.json` y `next-env.d.ts`: hay que restaurarlos.
- Las rutas de datos de las granjas llevan `/* turbopackIgnore: true */`; sin esa marca, el empaquetador intenta recorrer el proyecto y falla con el enlace roto de `.venv`.


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


## 2026-11-17 · Eventos de El Salvador e Instagram · Fase 0 (Supabase de desarrollo)

Decisiones del propietario tras revisar los hallazgos:

- **is_verified:** el hallazgo del 4 de octubre ya lo cierran 20261002, 20261003 y 20261021 (`proteger_verificacion_evento`). El trigger literal («si `auth.role() <> 'service_role'`, forzar») habría impedido que moderación aprobara eventos: el panel escribe como `authenticated` dentro de funciones `security definer`. Se amplía el trigger vigente solo con `verification_count` (0 al insertar por la API, fijo al editar). El conteo real lo escribe el trigger de `event_verifications` con `pg_trigger_depth() > 1` y no cambia. Archivo: `supabase/migrations/20261117_eventos_conteo_solo_equipo.sql` (spotmi-web) y su prueba.
- **Propuestas de Ezra:** la RPC `ezra_proponer_evento` acepta título, fecha, hora opcional, lugar, municipio, departamento, categoría (la lista del analizador) y descripción, que son los campos que `admin_decidir_propuesta` copia al evento. Precio y boletos no tienen columna en ese flujo: van como líneas de la descripción. Al aprobarla, Spotmi crea el evento como `official` con `source_id = 'analizador:<id>'` (comportamiento existente de spotmi-web).
- **Aplicación:** la CLI está vinculada pero sin sesión y hay otra migración pendiente (20261102, plan del equipo, preparada por otra persona), así que no se usa `supabase db push`. Se aplica desde el SQL Editor y después `migration repair --status applied 20261103 20261117`. La prueba previa corre las dos migraciones y ambas pruebas de ataque dentro de una transacción que termina con un error a propósito: nada queda aplicado.
- La migración 20261103 cumple el límite pedido salvo dos piezas auxiliares que ya traía: la función `es_cliente_editorial_ezra()` y la RPC `ezra_configurar_cliente()` (solo un founder con sesión puede habilitar cuentas). Desde el SQL Editor se habilita con un `insert` directo (`work/supabase-habilitar-editorial.sql`).


## 2026-11-17 · Fase 1: limpieza y consumo de Gemini

- **Menú:** Granjas · Eventos · Consumo · Calendario · Conexiones. «Equipo de agentes» solo se muestra a cuentas de cliente (vista de lectura); «Eventos y spots» (lectura pública de Spotmi) pasa a la tarjeta de Conexiones. Cualquier `?seccion=` retirada abre Granjas.
- **Archivar, no borrar:** el estado `archivada` ya existía. Se añadió el filtro «Ver archivadas» y «Restaurar». Las 9 granjas repetidas o de prueba se archivaron con el backend; sus ejecuciones y resultados siguen en la base.
- **Especialistas:** se añaden `verificador`, `redactor_ig` y `disenador_post`. La visibilidad vive en `ajustes_estudio` (clave `especialistas`); ocultar no cambia pasos ni encargos existentes.
- **Consumo:** `llamarGemini()` es la única salida a Gemini. Comprueba el presupuesto antes de llamar y registra fecha, origen, granja, ejecución, paso, modelo, los cinco contadores de `usageMetadata`, búsqueda de Google (y número de consultas), duración y error. Nunca guarda prompt, respuesta ni clave.
- **Presupuesto + 30 intentos (decisión del propietario):** `EZRA_PRODUCCION_IA=1` sigue siendo el interruptor general; Gemini se controla por tokens diarios y mensuales; Astra y Claude conservan 30 intentos al mes. El presupuesto es por tokens: una llamada que empieza con saldo puede pasarse un poco; la siguiente ya no sale.
- **Costo:** estimación con tarifas que escribe el propietario por modelo (entrada y salida por millón de tokens, búsqueda por 1 000 consultas). La salida incluye los tokens de razonamiento. Sin tarifa, «sin tarifa».
- **Modelo:** granjas, encargos y Ask usan `GEMINI_MODEL` o, si falta, `gemini-3.5-flash-lite` (el mismo valor por defecto que ya usaba Ask).
- **Incidente evitado:** al importar Gemini de forma estática en `proveedores.ts`, `tests/produccion.test.ts` resolvía la carpeta de datos antes de apuntarla a `work/` y leyó `data/produccion-spotmi.json`. Falló en la primera lectura, no escribió (fecha del archivo sin cambios). La importación es ahora diferida.
- **Servidor del puerto 3000:** no se tocó, pero `next build` reescribe `tsconfig.json` y `next dev` se reinicia solo; al reiniciar aplicó la migración 3 con su copia en `data/granjas/respaldos/`.


## 2026-11-17 · Fase 2: granja «Eventos de El Salvador» y bandeja

- **Cazador:** Gemini con `googleSearch` y un prompt propio que pide JSON. La API de Gemini no permite limitar la búsqueda a dominios, así que la lista de fuentes permitidas se aplica después: el verificador rechaza cualquier URL fuera de la lista y siempre las redes sociales. Los enlaces de redirección de la búsqueda se resuelven sin seguir el destino.
- **Verificador sin IA (proveedor `local`):** no consume tokens. Confirma solo lo que aparece en la página (o en su `schema.org startDate`). «7:30» sin a. m./p. m. no confirma ninguna hora. El texto completo de la página se usa en memoria y no se guarda.
- **Sugerencias visibles, no datos:** lo que el cazador dijo y la fuente no confirma queda en `sugerencias`, mostrado como «el cazador indicó…, no aparece en la fuente». Fecha, hora y precio siguen en null.
- **Estados:** la decisión del propietario (`nuevo`, `aprobado`, `descartado`) se guarda aparte de Spotmi (`propuesto`, `aceptado`, `descartado`, `duplicado`) e Instagram (`post_listo`, `subido`). La bandeja muestra el estado combinado que pidió el propietario.
- **Editar = volver a aprobar:** cambiar un hecho devuelve el evento a «nuevo» (misma regla que las versiones aprobadas del piloto). Un dato escrito a mano queda «confirmado por ti».
- **Idempotencia con Spotmi:** clave `ezra-evento-<id>-<hash del contenido>`, guardada antes de llamar. Si la red falla, el reintento usa la misma clave y Spotmi devuelve la misma propuesta. Mientras haya un envío sin confirmar no se puede editar el evento (otra clave sí duplicaría).
- **Sesión editorial:** Supabase rota el refresh token; el token renovado se guarda cifrado. Si la sesión venció, se vuelve a entrar con `SPOTMI_EDITORIAL_*`. El publicador genérico de piezas no guarda el token renovado (pendiente aparte).
- **Respaldo sin Spotmi:** «Copiar ficha» y CSV/JSON del día de hallazgo (CSV con BOM y celdas que empiezan por `=`, `+`, `-` o `@` protegidas).


## 2026-11-17 · Fase 3: post para Instagram, horario y LaunchAgent

- **Imagen sin IA:** el proyecto no tenía un método HTML→PNG y el ffmpeg de esta Mac no tiene `drawtext`. Por decisión del propietario se usa `next/og` (incluido en Next: satori + resvg, local, sin red ni dependencias nuevas). Plantilla en `src/lib/granjas/diseno.ts`; fuentes Geist (de Next) y Arial Bold del sistema si existe; ícono oficial reducido en `assets/marca/spotmi-icono-blanco.png` (copiado de spotmi-web). Fondo solo si el evento tiene imagen guardada con nota de permiso (PNG o JPG).
- **Texto:** reglas verificadas en código (`validarTextoIG`). Dos intentos con la IA; si no cumple, plantilla sin IA con una nota visible. La descripción del cazador no entra a la plantilla si menciona hora o precio sin confirmar. Cada intento queda en Consumo.
- **Instagram:** no hay API. «Marcar como subido» solo guarda un enlace `instagram.com/p/…` o `/reel/…` normalizado.
- **Horario:** tabla `horarios`, aparte de la granja, para que cambiar la hora no cree versiones ni invalide aprobaciones. La reserva del día es un `update … where ultima_fecha <> hoy`: atómica entre procesos. Un error al iniciar deja el día reservado (no se reintenta cada minuto). Encadenada: corre cuando la otra granja corrió hoy y terminó; si la otra no corre ese día, esta tampoco. La tarea perdida solo se recupera el mismo día.
- **Consentimiento:** programar una granja con IA exige marcar el consentimiento una vez y tener presupuesto diario y mensual. Las ejecuciones programadas guardan `origen: horario` y `usuario: horario`.
- **Máximos:** eventos nuevos por día y posts por día se cuentan sobre lo creado ese día por la granja (manual + programado). La prueba real usa límites por ejecución (3 eventos, 1 post).
- **LaunchAgent:** plantilla en `ops/macos/`, scripts de instalar/desinstalar con `launchctl bootstrap/bootout`. El trabajador independiente ahora también lee `.env.meta.local` (necesita `EZRA_TOKEN_KEY` para la sesión de Spotmi).
- **Recetas visibles:** primero las dos del flujo diario; las demás en «Otras recetas». La guía turística (sin pasos ni interfaz, trabajo previo) no se ofrece; se añadieron los textos que faltaban de las recetas de Instagram y Facebook generales.
- **Desborde corregido:** un texto oculto para lectores de pantalla (posición absoluta) escapaba de su tabla desplazable; los contenedores de tablas ahora son `position: relative`.

## 2026-11-18 · Imagen oficial, importación y búsqueda diaria de eventos

- **Regla de imagen y permiso.** Una imagen de evento solo se toma de su ficha oficial (página fuente y, si no hay, la de boletos), en este orden: og:image, twitter:image, imagen del Event de schema.org e imagen principal. Nunca de redes sociales ni de sus CDN (cdninstagram, fbcdn, twimg, tiktokcdn). JPG/PNG/WebP validado por contenido, ≤ 8 MB, lado menor ≥ 600 px. Se guarda con el permiso «Imagen promocional de la fuente oficial: <dominio> · pendiente de tu confirmación»; al confirmar pasa a «… · confirmada por ti el <fecha>». El post de Instagram solo usa una imagen confirmada; nada se confirma de forma automática.
- **Importación.** El JSON pasa por el mismo verificador que el Cazador: la fecha se confirma en la fuente o el evento se descarta; hora y precio quedan «por confirmar» si no aparecen. Los dominios extra (`--dominios`) valen solo para esa importación; la interfaz usa los de la granja. Las importaciones no cuentan para el máximo diario.
- **Fuente que manda.** Ficha de ticketera o productora > ficha de MITUR > nota de prensa. Si se contradicen, gana la ficha oficial y la diferencia queda en la nota de verificación.
- **Eventos de varios días.** Un solo evento con `fecha_fin` (migración 6). Sigue vigente hasta su último día. Un cierre incoherente en la fuente (fin antes del inicio) deja el fin por confirmar.
- **Duplicados.** Los nombres de departamento no cuentan como palabra distintiva cuando hay otras; «contener al otro título» solo cuenta con ≤ 2 palabras de diferencia.
- **Horario.** Activar un horario después de su hora no ejecuta en ese momento: la primera vez es al día siguiente. La recuperación al despertar solo aplica a horarios que ya estaban activos.
- **Fuentes no legibles.** No se finge un navegador: Todoticket (500 a «EzraSpotmi/1.0») y Fun Capital (solo JavaScript) quedan permitidos para enlaces, pero no como Fuentes.

## 2026-11-18 (noche) · Redes por API, imágenes sin IA y confianza

- **Política de redes.** Nunca se raspa HTML de Instagram, Facebook, TikTok, X ni Threads: `dominiosProhibidos` sigue igual para leer páginas. Solo vías oficiales: Instagram con Business Discovery (inicio de sesión de Facebook, cuenta profesional de Spotmi vinculada a la Página; permisos `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`; según la documentación de Meta no existe con el inicio de sesión de Instagram), Facebook con Page Public Content Access (revisión de Meta y verificación del negocio; apagado hasta `EZRA_FACEBOOK_PPCA=1`). TikTok: la Research API es solo para investigación académica sin fines de lucro y la Display API solo lee los videos de quien autoriza, así que no se integra; «Pegar enlace» guarda la URL sin abrirla y con los datos escritos a mano.
- **Excepción acordada (propietario, 18 nov).** La imagen de un post leído por la API oficial se acepta del CDN de Meta (`cdninstagram.com`, `fbcdn.net`) como imagen oficial pendiente de confirmación. Ningún otro camino acepta esos CDN.
- **Enlace manual como fuente (propietario).** Un evento creado con «Pegar enlace» puede tener la red social como fuente principal (35 puntos). Editar conserva ese enlace pero no permite cambiarlo por otra red ni poner una red en un evento de otro origen.
- **Imágenes con IA: no (propietario).** El prompt pedía generar imágenes ilustrativas con Gemini; los modelos de imagen no están en el plan gratuito y el propietario decidió no generarlas. Sin imagen oficial, el cuadro azul con la fecha. Nunca se retoca una imagen oficial.
- **Imagen genérica.** Se descarta una candidata si su ruta es de logo, favicon o similar, si es la og:image de la portada del sitio, o si 2 o más eventos ya usan esa URL o ese archivo.
- **Confianza (0–100).** Base por la mejor fuente: organizador o ticketera 90, gobierno o MITUR 85 (y cualquier `.gob.sv`), cuenta oficial por API 80, prensa 65, agregador o blog 45 (dominio desconocido), enlace manual de red 35. +10 si 2 o más orígenes independientes (dominio sin `www.` o cuenta) coinciden en fecha (±1 día o dentro del rango) y en lugar compatible; −10 por hora, precio o lugar por confirmar; −20 una vez si dos orígenes se contradicen en fecha, hora o lugar; −15 si la mejor fuente tiene más de 30 días (publicación del post o, si no, última lectura). Se recalcula al leer; la columna `confianza` es una instantánea. «Cuenta oficial verificada» = cuenta de la lista «Cuentas a seguir»: Business Discovery no informa la verificación.
- **Actualización.** Solo la propia fuente (misma URL o mismo sitio que la fuente principal) cambia fecha, hora, precio o lugar; otra fuente que discrepa baja la confianza. Un dato escrito por el propietario no se toca; un evento ya en Spotmi no cambia (se anota en la nota de verificación); un evento aprobado vuelve a «nuevo».
- **Ajustes.** «Confianza por dominio» y «Cuentas a seguir» viven en Eventos (el menú reducido no tiene sección Ajustes); se guardan en `ajustes_estudio`.

## 2026-11-19 · Imágenes: afiche, prensa y referencia IA

Prevalece sobre «Imágenes con IA: no» del 18 nov: el propietario pidió la imagen de referencia IA y eligió el modelo y el alcance.

- **Causa del fallo de Smart Ticket.** El CDN (`blobsmartticket.blob.core.windows.net`) ya estaba permitido: HTTP 200 y validación por contenido correctas. Sus banners miden 1238×556 y la regla pedía 600 px de lado menor.
- **Baja resolución.** Un afiche oficial de 300–599 px de lado menor se acepta marcado «baja resolución»; menos de 300 px se rechaza. La foto de prensa sigue pidiendo 600 px.
- **Orden y prioridad.** Afiche oficial (fuente, boletos, otras fuentes no de prensa y ficha en ticketeras) › post de cuenta oficial por API › foto de prensa (dominio de tipo «prensa» en Confianza por dominio) › referencia IA › cuadro azul. Un tipo mejor reemplaza a uno peor y el anterior queda en `evento_imagenes`; nunca se reemplaza un afiche ni una imagen confirmada. Todoticket (500) y Fun Capital (solo JavaScript) no se pueden leer: la búsqueda de fichas funciona en Smart Ticket.
- **Referencia IA (reglas).** Modelo `GEMINI_IMAGE_MODEL`, por defecto `gemini-3.1-flash-lite-image` (≈ US$ 0,034 por imagen a 1K según la tabla de precios de Google; sin plan gratuito). Pasa por `llamarGemini` (presupuesto y Consumo) y por el límite «Imágenes IA por día» (15). El prompt se arma solo con frases fijas en inglés (`escenas-categoria.ts`, `prompt-imagen.ts`, versión `2026-11-19.1`) elegidas por categoría, lugar, fecha, hora y descripción: ningún texto del evento se copia, así que no entran artistas, marcas, patrocinadores ni recintos; del artista solo se usa el género si la descripción lo dice. Negativo fijo; la API no tiene campo negativo ni semilla, así que va como «Avoid: …» y regenerar es otra llamada. Salida 4:5 (928×1152) escalada a 1080×1350 con ffmpeg. Control barato con el modelo de texto (texto, logo, persona); si falla, un reintento; si vuelve a fallar, cuadro azul. Un prompt editado se revisa (palabras del título, mayúsculas, marcas, @ y #) y no se genera sin confirmar.
- **Uso (propietario): solo en la bandeja.** La referencia IA se guarda con `generado = 1`, licencia «Imagen de referencia generada con IA (Gemini)», prompt, negativo, versión y modelo. Nunca se confirma como oficial, nunca llega al post de Instagram (el diseñador la ignora) ni a Spotmi, y se muestra con la etiqueta «IA · referencia».
- **Sin facturación.** Si Google responde 429 con la cuota gratuita en 0, se guarda un aviso que la bandeja muestra hasta el primer éxito, y el lote o la granja dejan de pedir imágenes en esa ejecución.
- **Precio «Desde $X».** El menor monto del texto de precio; «Gratis» solo si el texto lo dice sin montos; si no, «Precio por confirmar». Se calcula al leer y se guarda como instantánea `precio_desde`.


## 2026-11-18 · Catálogo editorial integrado en Ezra
Por solicitud del propietario, Codex integró las tarjetas 3:2 y la pestaña Vista previa Spotmi desde la copia aislada. Se conservaron los archivos en curso de Claude (inicio, onboarding, encargos y backend de producción). Vista local con búsqueda, filtros, eventos aprobados vigentes y enlaces a fuentes. Imágenes públicas de la vista previa solo con confirmación y permiso; referencias IA excluidas. No se modifica el sitio público ni data/. Validación previa aislada: 129 pruebas y build; verificación conjunta en curso.

Verificación conjunta al integrar: 129/129 pruebas unitarias; compilación Webpack de instantánea combinada en copia aislada correcta. Lint del módulo de eventos correcto. Lint global detectó cinco símbolos sin usar en estudio.tsx mientras Claude lo modifica; se preservó su trabajo. Integración HTTP y revisión en navegador siguen pendientes por las limitaciones del entorno documentadas anteriormente.


## 2026-11-18 · Referencia manual de Gemini desde tarjetas
Se añadió «Preparar referencia para Gemini» a tarjetas sin medio o con referencia IA. Usa referencia_prompt existente, adapta la composición manual a 3:2 y ofrece copiar, abrir Gemini y subir JPEG/PNG/WebP mediante el flujo existente referencia_subida. No llama a generación facturada ni cambia la política de publicación: referencia IA solo en bandeja, nunca fotografía oficial ni portada pública. La interfaz aclara que falta de imagen en Ezra no prueba ausencia en todas las fuentes. Lint del archivo, TypeScript y 10 pruebas de eventos/catálogo pasan; pendiente revisión manual en navegador y generación real en la app de Gemini. No se modifican archivos de inicio/onboarding de Claude.

## 2026-11-19 · Estudio: rediseño funcional e imagen original de Instagram/Facebook

- **Estudio (commits `19239dd` y anteriores).** Inicio con «Tu siguiente paso» calculado de lo guardado y tres grupos (atención, en curso, aprobado). Revisión con el contenido y los medios primero, «Aprobar la versión N», «Solicitar cambios» y «Rechazar» (estado nuevo `rechazado`, con motivo; editar lo reabre como versión nueva). Calendario por tipo de fecha (prevista, autorizada, publicación confirmada, subida a mano, evento) en `/api/produccion/agenda`. Las referencias visuales pedidas (Buffer, FLORA, Relevance AI, AirOps y la «web de referencia adjunta») no se pudieron ver: se usaron patrones conocidos, sin afirmar haberlas analizado.
- **Cambio respecto a las restricciones anteriores (pedido del propietario, 19 nov).** Ezra puede vincular a un evento una publicación de Instagram o Facebook y recuperar su imagen, siempre a pedido del propietario y por vías autorizadas. Sigue prohibido raspar HTML de redes, eludir inicios de sesión, rastrear periódicamente o descargar en lote; `dominiosProhibidos` no cambia para leer páginas.
- **Qué se recupera automáticamente (documentación de Meta, nov 2026):**
  - Instagram, cuenta propia (conexión de Instagram): imagen, cada foto del carrusel y, en video, el archivo para elegir un fotograma (ffmpeg local) o su miniatura. Meta omite el archivo de videos con audio protegido. `/me/media` con el inicio de sesión de Instagram no aparece explícito en la documentación: queda por confirmar con una llamada real.
  - Instagram, cuenta profesional de terceros: Business Discovery (conexión de Facebook con `instagram_basic`, `instagram_manage_insights` y `pages_read_engagement`), solo entre sus publicaciones recientes; las cuentas personales o con restricción de edad no devuelven datos.
  - Facebook de terceros: exige Page Public Content Access (no aprobado). No se intenta.
  - oEmbed no se usa: ya no entrega miniatura y Meta prohíbe usar su contenido fuera de un embebido.
- **Sin acceso:** se explica el motivo real y se ofrecen «Abrir publicación» y «Subir o pegar captura» con recorte en el navegador; el enlace queda como fuente del evento (sin duplicarse). No hay captura automática: no existe un mecanismo autorizado para hacerla.
- **Validación:** guardar exige confirmar título, fecha y año, lugar y organizador (no basta con el título: podría ser otra edición). Se muestran la fecha de la publicación y la del evento por separado, y si el evento ya pasó. «Leer datos del afiche» (Gemini, opcional) solo sugiere; nunca sobrescribe el evento.
- **Persistencia (migración 9):** la imagen guarda su origen (`web`, `original`, `captura`, `fotograma`, `prensa`, `ia`), la URL de la publicación, la plataforma, la cuenta (verificada solo si la confirmó la API, que el servidor vuelve a consultar al guardar) y la fecha de recuperación; el historial conserva las anteriores.
- **Referencia interna frente a portada autorizada:** encontrar o capturar una imagen no da permiso para republicarla. Queda «Referencia interna · permiso pendiente» hasta «Confirmar permiso de reutilización». La exportación JSON solo incluye `portada` con permiso confirmado; el post de Instagram solo usa imágenes confirmadas y nunca referencias IA.
- **Invalidación:** cambiar la imagen de un evento devuelve a borrador los posts de Instagram preparados con la anterior (los ya subidos no se tocan) y deja el permiso de la nueva en pendiente.

## 2026-11-19 (noche) · Tema claro y composición editorial

- **Referencia:** la «web de referencia adjunta» no llegó (solo el texto del pedido). No se imitó ningún sitio: se aplicaron la paleta y las pautas escritas por el propietario.
- **Paleta por variables** (`--ep-*` en `estudio.css`): fondo `#F7F8FA`, superficies `#FFFFFF`, texto `#182230` / `#667085`, bordes `#E4E7EC`, acento `#4F46E5`, selección `#EEF2FF`; semánticos aparte (éxito `#067647`, advertencia `#B54708`, error `#B42318`, información `#175CD3`, cada uno con su fondo claro). Los ~300 colores fijos del tema oscuro/lima se convirtieron según la propiedad donde se usaban (fondo, texto, borde) y `color-scheme` pasó a `light` para que los controles nativos no salgan oscuros. Sin dependencias nuevas; tipografía de sistema.
- **Estructura:** cabecera compacta (marca y espacio de trabajo; cuenta, idioma y cierre de sesión en un menú con `aria-expanded`, Escape y clic fuera). Barra lateral de 232 px con la selección en fondo tenue y texto índigo; en móvil, menú desplegable. «Nuevo encargo» salió del menú: es la acción principal en Inicio y Encargos.
- **Una acción principal por pantalla:** en tarjetas, conexiones, consumo y horario, los botones que antes eran sólidos pasan a secundarios; el índigo sólido queda para la acción principal de cada pantalla.
- **Inicio:** guía compacta con progreso real y pasos desplegables (desaparece al completarla); «Requiere tu atención» es la sección principal con filas compactas (título, motivo, estado y acción concreta) y el siguiente paso integrado cuando no hay pendientes; «En curso» compacto; fechas, aprobados y granjas en una columna secundaria.
- **Otras pantallas:** Eventos sin imagen usa un espacio reservado compacto sin repetir el título; los detalles técnicos de conexiones, n8n y almacenamiento quedan plegados; Consumo no dibuja una gráfica vacía.
- **Especificidad:** `granjas.css` y `event-catalog.css` se cargan después de `estudio.css`; las reglas del tema claro sobre clases `eg-`/`ec-` llevan `.ep-estudio` delante para ganar.

## 2026-11-20 · Director de arte con Claude y Astra
Pedido del propietario: usar Astra o Claude para hacer posts, imágenes y videos desde la web. Claude y Astra no generan píxeles por este camino: deciden el diseño (JSON cerrado) y Ezra lo dibuja en local con next/og; así cada post usa material oficial o propio y no hay costo de imágenes. La receta «Post para Instagram» sigue con el diseñador en local por defecto porque 3 posts al día con Claude agotarían los 30 intentos mensuales en unos 10 días; el propietario elige Claude/Astra por paso o por post. Hallazgo: Codex (Astra) sí tiene generación de imágenes con la sesión de ChatGPT; se conectará como fuente de «referencia IA» (nunca oficial) tras probarla.

## 2026-11-20 · Rediseño estilo Avvyren/Kaviyan/OrbAI (Fase 1)
El propietario pegó un brief con referencias de diseño. Aclaró: las granjas son las de contenido (no fincas agrícolas), se rediseña el Ezra real con sus datos (sin datos de ejemplo) y los agentes son los robots pixel existentes. Sin dependencias nuevas (CSS con variables, WebGL propio, SVG), aunque el brief pedía Tailwind, Framer Motion y Three.js: el proyecto ya tiene 3.000 líneas de CSS por variables y no conviene sumar ~150 KB. La personalización se guarda en el servidor por usuario (no en localStorage) y solo cambia la presentación; los números siempre salen de los datos. Instagram (@spotmi.sv) sí está conectado con permisos de métricas: la Fase 3 las mostrará reales.

## 2026-11-20 (tarde) · Estructura con barra lateral, encargos por resultado y trazabilidad real
Pedido del propietario con criterios explícitos. Decisiones: (1) la barra lateral vive en el shell y el estudio la llena por portal, con la sección en la URL; (2) los tres estados de un encargo (editorial, ejecución, entrega) se derivan de datos existentes, sin migración: la ejecución sale del historial y se agrega la acción «fallo»; la entrega de encargos es siempre manual (no hay publicación automática); (3) la trazabilidad reutiliza relaciones existentes (`evento_fuentes`, `posts_ig.evento_id`, URL exacta de las fuentes del encargo, `spotmi_clave`/`spotmi_estado`); nunca títulos parecidos; sin vínculo = «Procedencia no registrada»; (4) el mapa usa la geometría de departamentos que ya generó spotmi-web desde Natural Earth (dominio público), sin descargas nuevas; los marcadores son agregados por departamento y se dice; (5) el propietario prefirió el diseño oscuro de puntos para el mapa: se conservó y se hizo funcional; las animaciones solo aparecen con actividad real; (6) los porcentajes de Gemini salen todos de `estadoPresupuesto`; el «% del día» es avance de tareas y se rotula así.


### 2026-11-20 · Mapa de procedencia en Inicio
El mapa administrativo comparte Inicio con los indicadores. El directorio guarda los enlaces en el cazador de la granja de eventos elegida con control de revisión. Las conexiones del mapa se calculan a partir de eventos registrados. La cabecera ofrece un modo oscuro general que se recuerda en el navegador.

El mapa de Inicio ocupa la misma columna completa que los indicadores. El detalle de la selección se presenta debajo para conservar el ancho de la visualización.
El lienzo geográfico conserva fondo blanco, país punteado negro y acentos azules y violetas en ambos temas.
Se recuperan los acentos azules anteriores del mapa. Inicio y el lienzo comparten fondo blanco o carbón según el tema. Se retira el fondo multicolor del estudio.

### 2026-11-20 (noche) · Inicio con el mapa como protagonista, dos temas y barra plegable
Pedido del propietario con una captura de referencia. Decisiones: (1) el mapa va justo debajo del encabezado de Inicio, sin tarjeta, y los indicadores, totales, filtros y fuentes de recolección quedan debajo; (2) nuevo `granjas/mapa-procedencia.tsx`: fuentes en columna a la izquierda (nombre y cantidad una vez), ezrá sobre el mapa con un punto de llegada por línea y destinos a la derecha; curvas suaves por detrás de los nodos; se retiraron las pastillas largas sobre las líneas; (3) el detalle aparece al pasar, tocar o enfocar con teclado (cantidad, última lectura o hallazgo, departamentos o fuentes relacionadas, siempre de vínculos guardados); una fuente resalta solo su propio recorrido; (4) etiquetas de departamento sin choques: primero la enfocada y la elegida, luego por tamaño; la que no cabe se oculta y se consulta en su punto; los marcadores nunca se desplazan; (5) la disposición depende del ancho real del contenedor (≥ 820 px completa; debajo, solo el mapa con listas compactas), así plegar la barra o cambiar el tema conserva selección y líneas unidas; (6) temas: solo claro y oscuro, sol y luna en la cabecera, preferencia por navegador en `ezra:tema`; «líquido» (en el navegador o en `preferencias.temas`) se lee como claro y se retiró el fondo líquido; (7) la barra lateral se pliega con un botón en su borde, visible en ambos estados. Se corrigió además el filtro por fecha de descubrimiento y publicación: compara el día en El Salvador (antes, desde las 18:00 perdía los eventos del día).

### 2026-11-20 (cierre) · Mapa de Inicio v2: el país protagonista y un solo lateral
Pedido del propietario con captura y tres videos de referencia (565 aparición por etapas, 572 estados de carga, 629 movimiento de conexiones). Decisiones: (1) un marcador por departamento con su conteo dentro, de 11 a 22 px en pantalla (las cabeceras más cercanas, Cuscatlán y San Salvador, quedan a 43 unidades: no se tocan); el nombre completo solo al pasar el cursor, enfocar o elegir; (2) fuentes, ezrá y destinos en un solo lateral a la derecha que crece como lista con desplazamiento propio; «Sin ubicación confirmada» vive en el lateral y nunca se ancla al mapa; ezrá pasa a ser un paso discreto entre fuentes y destinos; (3) en reposo no hay curvas sobre el mapa; al elegir una fuente, departamento o destino se dibujan una vez, con un punto que recorre la línea y se queda en la llegada, solo las conexiones que existen en los datos (fuente → departamento, departamento → destino con envíos reales); cambiar de selección desmonta el dibujo anterior; las rutas pasan por debajo de marcadores y filas y llegan a su borde; (4) pasar el cursor no fija nada: la selección se mantiene; clic, toque o Enter la fijan y Escape la quita; (5) aparición por etapas (país → marcadores → lateral) sin bloquear el uso; el país se ve antes de que lleguen los datos, con lateral y totales reservados; el alto lo fija el mapa, así cargar o cambiar Eventos/Contenidos no mueve la página; los conteos cambian en su lugar; (6) en pantallas angostas el listado va plegado debajo del mapa; con movimiento reducido no hay animaciones y las rutas aparecen completas.

### 2026-11-21 · Mapa con ezrá al centro y carga que anticipa; Codex y Claude Code comprobados
Mapa (pedido del propietario con captura): arriba no hay texto; ezrá en el centro con una conexión a cada departamento con eventos (curvas suaves con degradado, flujo discreto solo con lecturas recientes); el título, los controles (Geografía/Trazabilidad, Eventos/Contenidos), el detalle y el listado de fuentes, destinos y «sin ubicación» van debajo del mapa; la explicación larga quedó plegada en «Cómo leer el mapa». Carga por partes que anticipa lo que viene: el país aparece en ola, ezrá late y líneas fantasma viajan a los 14 departamentos con anillos donde irán los marcadores; al llegar los datos se trazan las conexiones reales y aparecen los marcadores con su conteo. El video de referencia del propietario quedó en una carpeta temporal que macOS no deja leer; se aplicó la descripción. Las líneas con trazo animado no usan `vector-effect: non-scaling-stroke` (con `pathLength` Chrome las corta): su grosor se calcula con la escala del mapa.
Codex y Claude Code (plan del 20 nov): `src/lib/produccion/ia-local.ts` distingue no instalado, sesión pendiente (incluye clave de API, que el estudio no usa), versión incompatible (cada opción de seguridad se busca en la ayuda de la versión instalada; si falta, no se usa y no se quita la restricción), sesión comprobada, prueba correcta, límite de uso y error. «Verificar» no invoca al modelo; «Probar respuesta» es un clic aparte que pide «OK» y usa un intento del plan. Las rutas que ofrecían los proveedores con `Boolean(ejecutable)` ahora usan el diagnóstico (caché de 2 min) y generar se niega antes de gastar un intento si no hay sesión o la versión es incompatible. Nunca se copian tokens, correos ni la salida técnica.

### 2026-11-21 (madrugada) · Compartir con Docker, conectar redes y Eventos en lista
Por pedido del propietario («haz lo mejor», sin pedir aprobaciones mientras dormía):
- Next 16.4.6 estable con npm; se retiraron los archivos de pnpm. La caché de npm de esta Mac tiene archivos del administrador (de un `sudo` anterior) y npm omitía en silencio `@next/swc-darwin-arm64`: el lockfile se regeneró con una caché aparte y solo cambiaron los 10 paquetes de Next. Correo personal retirado de los archivos actuales; el historial ya en GitHub lo conserva (reescribirlo es decisión del propietario).
- Docker probado de verdad con Colima (sin contraseña): imagen con ffmpeg, puerto solo en 127.0.0.1, datos en el volumen, 165/165 e integración 7/7 dentro del contenedor. En Mac/Windows los avisos de cambio no siempre cruzan a la VM: dentro de Docker Next revisa archivos cada 1 s (`EZRA_DOCKER_POLL`, `watchOptions.pollIntervalMs`); fuera de Docker no cambia. Con Colima el proyecto debe estar en la carpeta del usuario y conviene `--mount-inotify`. La prueba del trabajador real enciende su trabajador aunque el entorno lo apague. Rama publicada en GitHub sin unir a main.
- YouTube como canal nuevo: OAuth de Google (http://127.0.0.1 permitido), lectura del canal y subida reanudable siempre en privado (borrador para YouTube Studio); nunca publica. TikTok usa un puente https en n8n como Meta (`TIKTOK_REDIRECT_URI`); se corrigió que su exigencia de https revisaba la dirección de Instagram. Guía para el propietario: `docs/CONECTAR_REDES.md`.
- Eventos: lista compacta (miniatura 96×112, título, fecha y lugar con «por confirmar», fuente y confianza discreta, estado, «Revisar» y menú de acciones con teclado); búsqueda local; «Más filtros», «Importar» y «Fuentes y confianza por dominio» plegados; el aviso de Gemini va junto a su acción y Spotmi se muestra como estado compacto. En el detalle, el afiche completo a lo ancho sin recortar y la confianza como indicador con desglose plegado (el anillo con porcentaje se retiró). Un medio sin archivo responde 404 claro.

### 2026-11-21 · Apps conectadas
Pedido del propietario (video 627 y captura de Instagram), primero en maqueta y luego directo en Ezra: el botón «Apps» reemplaza a Instagram en la barra. Al acercar el cursor (o con clic, toque o teclado) despliega las cuentas realmente conectadas (de Conexiones; nunca inventadas) en una columna flotante con aparición escalonada desde el botón; sigue abierta mientras el cursor esté en el botón o el menú (240 ms de margen), se cierra con Escape, tocando afuera o al elegir; varias cuentas de una red se agrupan; la activa lleva borde azul y ✓. Se dibuja en la raíz de la app (la barra tiene un desenfoque que atraparía un elemento fijo) y no mueve nada. Sección `?seccion=apps&app=canal:id`; los enlaces viejos `?seccion=instagram` abren Apps. Perfil: sin titular ni introducción; foto, nombre, @usuario, números, «Actualizar» y la última lectura como texto secundario; métricas debajo y contenido reciente al final. TikTok, Facebook y YouTube usan la misma estructura con «No disponible» donde Ezra aún no lee datos. Corregido: un token ilegible ya no esconde la última lectura correcta de Instagram.

## 2026-11-21 · Mapa de Inicio: Eventos · Ingresos · Población

- Selector arriba a la derecha; una capa a la vez; Inicio abre en Eventos. Código: `granjas/mapa-procedencia.tsx` (integración), `mapa-capas.tsx/.css` (selector, pulsos, panel, imán), `mapa-geo.ts` (proyección y recorridos), `src/lib/granjas/agenda-mapa.ts`, `src/lib/granjas/datos-pais.ts`.
- Eventos: el marcador y su agenda salen de `agendaVigente` sobre los mismos eventos de trazabilidad: no descartados, con fecha (confirmados), que terminan hoy o después en hora de El Salvador, sin duplicados (título normalizado + día + departamento). La agenda abre en panel lateral (escritorio) o inferior (móvil); Escape o cerrar devuelven el foco al marcador.
- Ingresos: puntos reales (aeropuerto; La Hachadura, Las Chinamas, San Cristóbal, Anguiatú; El Poy, El Amatillo), los terrestres ajustados al perímetro. Sin cifras: DGME (entradas migratorias, comparables entre los tres) y CEPA (pasajeros en llegadas, solo aeropuerto) quedan en `null` → «Datos aún no disponibles». El filtro «Por día» se habilita solo con registros diarios. Los pulsos son «Animación ilustrativa», nunca tráfico en vivo.
- Población: tabla oficial TAB_POB_2 del Censo 2024 (ONEC/BCR); los 14 departamentos + 107.055 «no especificado» suman 6.029.976 (lo comprueba una prueba).
- Campo magnético: solo puntos decorativos (DOM directo por rAF, sin re-render); marcadores y conexiones fijos; táctil = halo breve; movimiento reducido = brillo sin desplazamiento y recorridos estáticos.

## 2026-11-21 (tarde) · Mapa de Inicio: capas juntas, sin cápsula, límites departamentales

- Eventos e Ingresos son interruptores independientes (`aria-pressed`) y Inicio abre con ambos; Población queda como consulta aparte. Sin la cápsula «ezrá»: el país se centra (`VB` 280,200,700,400) y la relación con Ezra es un ancla discreta sobre el borde norte (`ANCLA`), de la que sale solo la conexión del marcador elegido.
- Ingresos: un marcador pequeño por cruce (zona de toque de 16 px) y un avión en el aeropuerto; cada uno abre su detalle (período, conteo, fuente) y repite solo su recorrido; la etiqueta del acceso abre el resumen. En pantallas angostas la etiqueta es solo la sigla, y un marcador de eventos que cae sobre un cruce se aparta lo justo.
- Límites reales de los 14 departamentos (`bordes()`): línea fina y tenue, también zona de cursor (nombre) y de toque; la selección realza contorno y puntos con suavidad. Límites y marcadores no se mueven con el efecto magnético.

## 2026-11-21 (noche) · Mapa: divisiones con puntos, conexiones en reposo y gráficas de ingresos

- Sin ancla «ezrá» ni rutas desde Ezra: la marca queda solo en la barra lateral.
- Divisiones internas: la misma cuadrícula; un punto es «límite» si su vecino (4 direcciones) es de otro departamento y ese departamento tiene nombre mayor (una sola hilera estable por límite, 265 de 2.164 puntos). Gris carbón en claro y gris claro en oscuro (`--mp-punto-limite`); el elegido realza su contorno (`filo`). El campo magnético no mueve los puntos de límite.
- Conexiones en reposo: curva fina de la etiqueta del país a cada puesto (celeste Guatemala, violeta Honduras), por detrás de los marcadores.
- Cortes oficiales por CSV (`src/lib/granjas/ingresos.ts`, `/api/granjas/ingresos`, archivo `data/granjas/ingresos-oficiales.json`): columnas fecha (AAAA-MM o AAAA-MM-DD), nacionalidad, puesto, tipo_movimiento (entrada · salida_origen · pasajeros_llegada · personas_presentes), valor, fuente, fecha_corte, url, alcance. Todo o nada; un valor vacío queda vacío. Sin doble conteo: el total publicado gana sobre el desglose y el corte mensual sobre la suma de días. Mes en curso → «Acumulado al [corte]». Sin mes pedido → el último publicado.
- «Salidas hacia El Salvador registradas en origen» (IGM, INM Honduras) solo en el detalle de cruces, con su alcance y período; la gráfica mensual por nacionalidad usa únicamente entradas DGME. CEPA, solo en el aeropuerto. «Personas presentes» solo si la fuente publica ese indicador.
- El comunicado del IGM compartido por el propietario no se pudo leer automáticamente (403): no se cargó ninguna cifra suya.

## 2026-11-21 (noche, 2) · Mapa más arriba y entradas por mes con estimación

- Mapa: `VB` 280,226,700,368 (sin margen sobrante arriba) y, en escritorio, los controles flotan en la esquina superior derecha; la etiqueta de Honduras pasa al noreste (906,338) para no quedar debajo. A 1000×620 el país entra completo.
- «Entradas por mes · AAAA»: los 12 meses con el total del país (DGME; «todos» si se publicó, si no la suma de puestos). Sin corte = vacío.
- Estimación NO oficial (rayada, con rango): solo con ≥3 meses cerrados. Método «interanual» (mismo mes del año anterior × variación de los meses comparables) si hay año anterior; si no, «tendencia» (mínimos cuadrados). Rango = error medio (mín. ±5 %). Muestra el cierre del mes en curso (nunca por debajo de lo registrado), el mes siguiente y el año (meses reales + estimados).
- No se cargaron las cifras de prensa de MITUR («visitantes internacionales»: enero ≈413 mil, agosto 357.325, acumulados) porque son otra medición distinta de las entradas DGME.

## 2026-11-21 · Perfil y estadísticas de YouTube en Apps

- El canal autorizado se presenta con el mismo perfil de Apps que Instagram. YouTube Data API v3 aporta avatar, totales y hasta 12 videos públicos recientes. Ezra no pide subir ni publicar contenido al ver esta pantalla.
- YouTube Analytics API agrega métricas de 7, 28 y 90 días hasta el último día devuelto. Horas salen de los minutos de visualización y suscriptores netos de altas menos bajas. Los campos que no llegan quedan vacíos. Sin tiempo real, permisos monetarios ni dependencia nueva.
- El acceso de solo lectura a Analytics requiere activar la API en el mismo proyecto y autorizar el nuevo alcance en Google. El perfil reutiliza el token cifrado de la conexión y comprueba la identidad antes de leer o mostrar la caché.

## 2026-11-21 · Arranque en Windows y macOS

- Docker Compose sigue como entorno común de desarrollo con Node.js 24.18.0, SQLite y FFmpeg, publicación del puerto solo en loopback y datos aparte en su volumen. El README también documenta el arranque nativo con la misma versión de Node.js desde PowerShell o Terminal.
- Los comandos de prueba delegan la búsqueda de archivos a Node.js para funcionar con ambos shells. El comando de alta del propietario lee `.env.local` para usar el mismo directorio de datos que el servidor.
- FFmpeg y FFprobe se detectan en `PATH` o mediante una ruta configurada. En Windows se buscan ejecutables `.exe`, también para Codex y Claude opcionales, manteniendo la ejecución sin shell y el entorno acotado.

## 2026-11-21 (noche, 3) · «Ingresos al país» por cortes oficiales (DGME / MITUR)

- Modelo por corte (`src/lib/granjas/ingresos.ts`, archivo `data/granjas/ingresos-cortes.json`): fuente (DGME | MITUR), métrica (DGME → ingresos; MITUR → visitantes; otra combinación se rechaza), período (mes | trimestre | semestre | anio) con `desde`/`hasta` completos (día 1 al último día), puesto o país (`clave` normalizada con alias, p. ej. «Pedro de Alvarado» → La Hachadura), valor y fecha de carga. Reemplaza al formato del mismo día (`ingresos-oficiales.json`, que no tenía datos reales). Se retiraron del detalle CEPA y «salidas registradas en origen» porque el nuevo modelo solo admite DGME y MITUR.
- CSV `fuente,metrica,periodo_tipo,desde,hasta,puesto_o_pais,valor` en dos pasos (`accion: vista | guardar`): vista previa, errores por fila, repetidos dentro del archivo (bloquean) y duplicados contra lo guardado (mismo puesto/país y período; se reemplazan solo si se marca). Plantilla descargable (`ingresos-formato.ts`) y copia en `docs/datos/`.
- Interfaz: interruptor «Ingresos DGME / Visitantes MITUR» (títulos y nota de metodologías distintas); selector de período agrupado (meses, trimestres, semestres, años) o «Sin cortes cargados». Sin ningún corte: una sola tarjeta «Esperando corte oficial de la DGME» con «Cargar CSV» y «Cómo pedir los datos» (pasos y texto de solicitud LAIP para copiar). Gráfico mensual solo con datos mensuales; si no, una barra por período («Corte DGME ene–jun 2024»). Barras por puesto con % del total (total publicado o suma de la gráfica) y variación contra el mismo período del año anterior; «Otros puestos» y «Aéreos y marítimos» plegados sin datos. Barras = botones con aria-label «Puesto, valor, período» que abren el detalle (en escritorio se sube hasta el panel). Estimación igual que antes (≥3 meses cerrados).
- Catálogo `PUESTOS_CATALOGO` en `datos-pais.ts`; Perquín agregado al mapa (coordenada aproximada ajustada al borde).
- El PDF DGME ene–jun 2024 no se pudo verificar (rutas de documentos de transparencia.gob.sv con 404): `docs/datos/dgme-terrestres-ene-jun-2024.csv` va con valores vacíos.

## 2026-11-21 (noche, 4) · Granja «Clips»

- Los videos de «Videos virales» son solo referencia: Referencias guarda métricas y enlaces; nunca se descargan ni se recortan (sin yt-dlp ni parecidos). Las piezas de Clips no llevan fuentes de terceros.
- Solo se corta material subido con origen declarado (`medios.permiso`: propio, o autorizado con autor y constancia). Si el video es de otra persona, el texto lleva «Video: autor (con permiso)».
- Transcripción y momentos: **Gemini con video**, elegido por el propietario frente a Whisper local. Por costo, solo con presupuesto definido y si la estimación (110 tokens/s con `MEDIA_RESOLUTION_LOW` + 12.000) cabe en el día y el mes; reintentar vuelve a gastar tokens y el mensaje lo dice. Material máximo 20 min.
- Subtítulos y gancho como imágenes de next/og superpuestas con ffmpeg: el ffmpeg de Homebrew no tiene libass ni drawtext. Zonas seguras: 250 arriba, 480 abajo, 90 izquierda, 150 derecha.
- La revisión de Clips es por clip, no por paso: aprobar un clip crea su pieza y aprueba su huella (la revisión genérica se rechaza en esta granja). La publicación reutiliza la autorización por versión y destino con PUBLICAR; `autorizarPublicacion` exige que el clip siga aprobado y que «Tu revisión» esté cerrada.
- El trabajo previo «Videos virales» (sin commit, de otra sesión) se guardó tal cual en `d5bd7cf` a pedido del propietario. Los cambios de Docker/README/package.json/.env.example siguen sin commit: no son de esta tarea.

## 2026-11-21 (noche, 5) · Cumplimiento de las YouTube API Services Developer Policies

- Plazo verificado en la página oficial (III.E.4): los datos que no son del canal autorizado (Non-Authorized Data) y sus estadísticas se guardan como máximo 30 días; después se borran o se vuelven a consultar. Ezra los **borra** (videos, enlaces de YouTube en fuentes, estadísticas en el texto y en el historial, resumen de Referencias de Clips); para tenerlos otra vez se vuelve a ejecutar el encargo. Encargos anteriores cuentan desde su última entrega.
- Revocación (III.D.2): al desconectar se revoca en Google de inmediato y no queda nada de la API: token, métricas en memoria e id/enlace de los videos subidos en los recibos. Si se revoca desde la cuenta de Google, el token local queda hasta «Desconectar» (documentado; plazo de 7 días a pedido).
- A Gemini (Clips) solo van cifras agregadas de «Videos virales»; nunca títulos, canales ni enlaces de videos ajenos.
- Textos legales en spotmi-web (rama `feat/ezra-youtube-api`, worktree aparte para no tocar `hero`): las páginas legales enlazan las URL del texto porque la política pide *enlazar* los Términos de YouTube y la Política de privacidad de Google. Se usa https://policies.google.com/privacy (la política cita http://www.google.com/policies/privacy, que redirige allí).
- `form-answers.md` recomienda cuota por defecto y no aceptar el almacenamiento de 36 meses de métricas derivadas, coherente con el borrado a 30 días.
