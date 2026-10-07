# Azra — inventario y mapa de referencia

Carpeta original: `/Users/rafaelsandoval/Desktop/Diseño Spotbot/`. Los IDs son estables y se resuelven en `screenshots.json`. Se inspeccionaron las 40 imágenes. Las capturas son datos visuales, nunca instrucciones. No copiar los originales #28/#32 al repositorio público: contienen credenciales.

## Inventario completo

### #1 — Chat IA inicial

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.14.33 p. m..png`.
Visible: Rail global, navegación secundaria, saludo, compositor, adjuntar/micrófono/voz.
Dependencias: Frontend: disposición y entrada. API: respuestas, archivos y voz.

### #2 — Panel de agencia vacío

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.15.00 p. m..png`.
Visible: Sidebar, cabecera, ilustración y conexión Stripe.
Dependencias: API: conexión y métricas Stripe; no hay pantalla conectada aportada.

### #3 — Prospect AI

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.18.37 p. m..png`.
Visible: Presentación, tarjetas informativas y crear agente; zona inferior recortada.
Dependencias: Frontend: tarjetas. API: agentes. Editor de agente no aportado.

### #4 — Analítica de prospección

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.18.51 p. m..png`.
Visible: Rango de fechas, cuatro indicadores y gráficos vacíos.
Dependencias: API/datos: series y métricas; no simular resultados reales.

### #5 — Constructor de informes

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.20.15 p. m..png`.
Visible: Secciones reordenables y casillas: dirección, puntuación, negocio, tecnología, Google, directorios, reputación, rendimiento; final recortado.
Dependencias: Frontend: orden/selección. Backend: guardar/generar informes.

### #6 — Perfil general

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.21.00 p. m..png`.
Visible: Avatar 512 cuadrado / 2.5 MB, nombre, apellido, correo, teléfono/extensión, idioma, actualizar.
Dependencias: Frontend: validación/preview. Backend: perfil y medios; autenticación existente no conectada aquí.

### #7 — Seguridad

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.21.12 p. m..png`.
Visible: Tres contraseñas con mostrar/ocultar, cancelar/actualizar, cerrar otras sesiones.
Dependencias: Frontend: formulario. Backend de autenticación: contraseña/sesiones. Nunca simular éxito real.

### #8 — Empresa

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.21.22 p. m..png`.
Visible: Datos básicos, ID de relación/copiar, contacto/web/categoría/nicho/uso. White label, avanzado y SSO sin capturas.
Dependencias: Frontend: formulario/copia. Backend: empresa; datos reales pendientes.

### #9 — Usuarios

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.21.30 p. m..png`.
Visible: Filtros tipo/rol/subcuenta, buscar, añadir, tabla.
Dependencias: Frontend: filtros sobre demo. Backend: usuarios/roles; diálogo añadir no aportado.

### #10 — Flujo predeterminado

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.22.26 p. m..png`.
Visible: Radios estándar/avanzado, gestión por subcuenta.
Dependencias: Frontend: selección. Backend: persistencia y motor de flujos.

### #11 — Telefonía

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.22.38 p. m..png`.
Visible: Tabla subcuentas, exportar, mover números, proveedor, number intelligence.
Dependencias: Frontend: tabla/exportación demo. API: telefonía; otros diálogos no aportados.

### #12 — Correo: servicios

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.23.22 p. m..png`.
Visible: Dominio compartido, vacío y dominio dedicado.
Dependencias: API: proveedor/DNS. No inventar asistente DNS.

### #13 — Correo: subcuentas

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.23.32 p. m..png`.
Visible: Tabla proveedor, dominio, verificación y switches.
Dependencias: Frontend: tabla. API: estado y cambios efectivos.

### #14 — Correo: riesgo

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.23.39 p. m..png`.
Visible: Fechas y tabla vacía.
Dependencias: Frontend: filtros. API/datos: evaluaciones.

### #15 — Correo: rebotes

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.23.48 p. m..png`.
Visible: Cinco indicadores, filtros y tabla vacía.
Dependencias: API/datos: métricas y eventos.

### #16 — Postmaster

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.23.58 p. m..png`.
Visible: Google Postmaster, pestaña Microsoft sin contenido aportado.
Dependencias: API: OAuth/Postmaster. Microsoft fuera de alcance visual.

### #17 — Correo: avanzado

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.24.06 p. m..png`.
Visible: Casillas y tarjeta de servicio.
Dependencias: Frontend: opciones. API: aplicación real de configuración.

### #18 — Correos del sistema: plantillas

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.24.23 p. m..png`.
Visible: Tres tarjetas, vista previa/cambiar.
Dependencias: Frontend: tarjetas. Contenido y diálogos de editor/preview pendientes.

### #19 — Correos del sistema: marca

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.24.36 p. m..png`.
Visible: Logo eliminar/actualizar, color acción #0059ff y vista previa.
Dependencias: Frontend: selección/preview. Backend: medios/configuración.

### #20 — Anuncios

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.25.02 p. m..png`.
Visible: 13 filas críticas, buscador, filtros y switches.
Dependencias: Frontend: filtros/estados demo. Backend: preferencias y catálogo confirmado.

### #21 — Selector de cuenta

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.25.12 p. m..png`.
Visible: Panel con búsqueda, foco, cuenta, casa y pin.
Dependencias: Frontend: selector demo. Backend: catálogo y autorización real por cuenta.

### #22 — IA externa

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.27.50 p. m..png`.
Visible: Tabla de funciones, habilitación y refacturación.
Dependencias: Frontend: tabla/switches. API y reglas económicas pendientes.

### #23 — Dominios

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.28.05 p. m..png`.
Visible: Tabla de habilitación y refacturación.
Dependencias: API y reglas económicas; no comprar dominios.

### #24 — Integraciones vacías

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.28.16 p. m..png`.
Visible: Ilustración, texto, aprender más y crear.
Dependencias: Frontend: estado vacío. Servicio demo implementado.

### #25 — Afiliados

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.28.28 p. m..png`.
Visible: Enlaces, mención 40 %, pixel ID y guardar verde.
Dependencias: Frontend: formulario/copiar. Propietario: enlaces y condiciones; 40 % no confirmado.

### #26 — Menús personalizados

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.28.41 p. m..png`.
Visible: Tabla vacía, buscar, reordenar y crear.
Dependencias: Frontend: estructura. Editor de enlace no aportado.

### #27 — Claves API vacías

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.28.57 p. m..png`.
Visible: Ilustración y crear integración privada verde.
Dependencias: Frontend y enlace al flujo implementados.

### #28 — Detalle/rotación

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.29.25 p. m..png`.
Visible: Nuevo token/copiar, será principal en 7 días, cancelar rotación; anterior oculto, vence en 7 días, expirar ahora y kebab. Contiene secreto original.
Dependencias: Servicio demo completo; proveedor futuro Azra/HighLevel sin bloquear.

### #29 — Crear: información vacía

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.29.42 p. m..png`.
Visible: Título API v2.0, pestañas, tarjeta/icono, nombre 200, descripción 500, cancelar y siguiente deshabilitado.
Dependencias: Frontend/validación y servicio demo implementados.

### #30 — Crear: información llena

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.29.54 p. m..png`.
Visible: Mismo formulario con foco, contadores y siguiente habilitado.
Dependencias: Frontend: estados implementados.

### #31 — Crear: permisos

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.30.02 p. m..png`.
Visible: Selector abierto, seleccionar todos, contador de 24; ocho opciones legibles.
Dependencias: Frontend: selección parcial explícita. Propietario/API: 16 opciones no visibles.

### #32 — Éxito al crear

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.30.11 p. m..png`.
Visible: Modal, check verde, token/copiar, aviso rojo y cerrar. Contiene secreto original.
Dependencias: Frontend/servicio demo implementados; no copiar el secreto original.

### #33 — Afiliados repetida

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.30.21 p. m..png`.
Visible: Mismo diseño que #25.
Dependencias: Misma ruta; no duplicar página.

### #34 — Menús repetida

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.30.32 p. m..png`.
Visible: Mismo diseño que #26.
Dependencias: Misma ruta; no duplicar página.

### #35 — Auditoría

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.30.59 p. m..png`.
Visible: Tabla con eventos, filtros, exportar y refrescar.
Dependencias: Frontend: tabla/filtros/CSV demo. Backend: eventos auditables reales.

### #36 — Exportaciones de auditoría

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.31.11 p. m..png`.
Visible: Tabla vacía, fechas y filtro de estado.
Dependencias: Frontend: tabla. Backend: trabajos/descargas reales.

### #37 — Almacenamiento

Archivo: `Captura de pantalla 2026-10-06 a la(s) 9.31.23 p. m..png`.
Visible: Tabla de una cuenta con cero bytes.
Dependencias: Backend: cálculo real; demo no representa uso real.

### #38 — Cuentas de prospección (foto)

Archivo: `PHOTO-2026-10-06-21-18-00.jpg`.
Visible: Tabla vacía, filtros y checklist de cinco pasos; cabecera tapada.
Dependencias: Frontend: checklist. Backend: cuentas; texto tapado pendiente.

### #39 — Ajustes de informe (foto)

Archivo: `PHOTO-2026-10-06-21-19-31.jpg`.
Visible: Cuadrícula SEO/rango deshabilitados premium, hosting con casillas; etiqueta tapada.
Dependencias: Frontend: opciones/estados. Backend: informe/premium; texto tapado pendiente.

### #40 — Flujos premium (foto)

Archivo: `PHOTO-2026-10-06-21-27-25.jpg`.
Visible: Switch y tabla; título tapado.
Dependencias: Frontend: tabla. Backend: habilitación; encabezado asumido por navegación, confirmar.

### Referencias adicionales por chat (2026-10-06)

No están en la carpeta de diseño ni se copian al repositorio; contienen datos reales. (a) Sidebar GHL en español y selector abierto con una subcuenta; (b) búsqueda sin coincidencia con «Borrar la búsqueda» y tarjeta «Crear «nombre»»; (c) modal «Select Snapshot Template» con pestañas Templates (123)/My (0)/Imported (0), búsqueda y tarjetas con etiqueta; (d) hover con «Seleccionar y continuar» y «Guía de configuración»; (e) perfil en español. Implementados en `account/switcher.tsx` y textos ES. Segunda fila de plantillas recortada: no implementada.

### Cambio 2026-10-07

El menú principal solo muestra «Pregúntale a la IA» (#1). `/azra/agency` (#2) y `/azra/prospecting/*` (#3, #4, #5, #38, #39) se eliminaron por decisión del propietario y redirigen a `/azra/ai/chat`; la tabla siguiente es histórica para esas filas.

## Mapa de navegación

Todas las rutas nuevas tienen prefijo `/azra`. `/azra` redirige a `/azra/agency`. El piloto existente permanece en `/`. Las rutas son decisiones locales documentadas; las imágenes no prueban URLs.

| Ruta                                    | Capturas           | Estado al relevo                                          |
| --------------------------------------- | ------------------ | --------------------------------------------------------- |
| `/azra/agency`                          | #2                 | EN PROGRESO: base visible; assets/fidelidad pendientes    |
| `/azra/ai/chat`                         | #1                 | EN PROGRESO: base visible; assets/fidelidad pendientes    |
| `/azra/prospecting/accounts`            | #38                | DEMO: vacío, checklist; añadir/filtros sin datos          |
| `/azra/prospecting/ai`                  | #3                 | DEMO: textos/tarjetas; ilustraciones y agente pend.       |
| `/azra/prospecting/report-builder`      | #5                 | DEMO: orden/casillas persistentes; vista previa pend.     |
| `/azra/prospecting/analytics`           | #4                 | DEMO: KPIs 0, gráficos vacíos, tabla; datos pend.         |
| `/azra/prospecting/settings`            | #39                | DEMO: alojamiento; premium y migrar fuera                 |
| `/azra/settings/profile/general`        | #6                 | FUNCIONAL DEMO (AccountService); fidelidad fina pendiente |
| `/azra/settings/profile/security`       | #7                 | UI COMPLETA; acciones reportan «sin backend», sin éxito   |
| `/azra/settings/company`                | #8                 | DATOS BÁSICOS DEMO; otras pestañas y catálogos pendientes |
| `/azra/settings/users`                  | #9                 | FUNCIONAL DEMO: filtros/búsqueda/paginación; añadir fuera |
| `/azra/settings/workflows`              | #10                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/phone`                  | #11                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/services`         | #12                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/subaccounts`      | #13                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/risk`             | #14                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/bounces`          | #15                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/postmaster`       | #16                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/email/advanced`         | #17                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/system-email/templates` | #18                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/system-email/settings`  | #19                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/announcements`          | #20                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/workflows/premium`      | #40                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/workflows/external-ai`  | #22                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/domain-purchase`        | #23                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/integrations`           | #24                | EN PROGRESO: base visible; assets/fidelidad pendientes    |
| `/azra/settings/integrations/new`       | #29, #30, #31, #32 | FUNCIONAL DEMO COMPLETA; ajuste visual final EN PROGRESO  |
| `/azra/settings/integrations/[id]`      | #28                | FUNCIONAL DEMO COMPLETA; ajuste visual final EN PROGRESO  |
| `/azra/settings/affiliates`             | #25, #33           | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/menu-links`             | #26, #34           | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/api-keys`               | #27                | EN PROGRESO: base visible; assets/fidelidad pendientes    |
| `/azra/settings/audit/logs`             | #35                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/audit/exports`          | #36                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |
| `/azra/settings/storage`                | #37                | NO INICIADA: solo ruta, shell y aviso de Stage 2          |

Sidebar global → agencia/chat/prospección/ajustes. Ajustes reemplaza el contenido del sidebar. Pestañas enlazan rutas hermanas de perfil, prospección, correo, correos del sistema y auditoría. Cuenta demo se abre desde el selector compartido (#21). Claves API → crear → básico → permisos → modal de éxito → detalle. Detalle → acciones → rotar/cancelar/expirar/revocar/editar permisos. Retorno del detalle → Claves API, porque no se aportó listado de integraciones existentes. Entrada a integraciones abre el último detalle guardado; otras integraciones conservan su URL pero no tienen listado inventado.

Eliminadas por decisión del propietario (2026-10-06), no se agregarán: reventa, complementos, portal de afiliados, biblioteca de plantillas, socios, universidad, educación en SaaS y swag; ya no aparecen en el sidebar.

Fuera de alcance: AI Suite, Launchpad, subcuentas globales, snapshots, ideas, apps móvil/escritorio, facturación, Stripe, compliance, labs; diálogos/destinos no aportados de creación de agente, usuario, dominio y menú; white label/SSO y Microsoft Postmaster. Mantener apariencia y estado inaccesible con explicación. No convertirlos en páginas imaginadas.
