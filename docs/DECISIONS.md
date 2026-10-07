# Decisiones

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
