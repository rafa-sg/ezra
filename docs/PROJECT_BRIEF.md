# ezrá · panel comercial para Sgmotos y motoxspress

## 2026-10-06 · Future product design extension

The owner has requested a design-stage expansion using Spotmi: authorized information collection, branded creative generation, and automatic inbound replies on Instagram, Facebook Messenger, and WhatsApp. The reviewable proposal is in `docs/design/spotmi/README.md`, with an isolated local prototype. This is the new design direction; it does not activate external services or replace the currently running commercial pilot described below. Spotmi's historical data and both client workspaces remain preserved.

Fecha de definición: 4 de octubre de 2026. Zona horaria: America/El_Salvador. Presupuesto: USD 20 adicionales al mes, independientes de las suscripciones de IA existentes. Gasto objetivo del piloto: USD 0.

## Resultado

Preparar publicaciones comerciales para Sgmotos y motoxspress: catálogo verificado → producto y variante → borradores para las redes elegidas → revisión explícita → aprobación de esa versión → fecha prevista → exportación → publicación manual. Spotmi queda conservado como archivo histórico, no como producto activo.

## Primer hito

Prototipo navegable y base local mantenible para tres paneles: administración, Sgmotos y motoxspress. Clerk ofrece un solo acceso; el servidor aísla cada panel. Seis pantallas: Resumen, Contenido (biblioteca y revisión), Calendario, Fuentes, Marca y criterios, Ajustes. Crear borradores reales, editar, adjuntar medios propios, aprobar/rechazar con memoria, planificar, exportar y respaldar todo en la misma carpeta.

## Diseño

Interfaz clara, editorial y tranquila. Fondo gris cálido, superficies blancas, violeta contenido, texto oscuro, tipografía de sistema, bordes sutiles, navegación lateral y tarjetas con ilustraciones originales de referencia. Espacio proporcional a las tareas. Adaptación a móvil y teclado. No llenar la interfaz con botones sin comportamiento.

## Memoria

Guardar reglas de marca, decisiones, correcciones y motivos de rechazo. No hay entrenamiento ni modelo conectado. Ningún sitio web ha sido rastreado. Fuentes iniciales son ejemplos y deben verificarse antes de uso real.

## Fuera de este hito

API Meta/Gemini, publicación automática, mensajes, scraping, estadísticas sociales, producción remota, cobros y dominio. La autenticación de desarrollo y las cuentas piloto sí forman parte del hito actual; las integraciones externas se añadirán detrás de límites claros.

## Criterios de aceptación

- Borradores persisten al recargar y reiniciar.
- Una edición editorial invalida una aprobación anterior.
- Aprobación exige texto, fuente autorizada y comprobaciones de hechos, medios y marca.
- Rechazo conserva motivo; una fecha prevista no dispara publicaciones.
- Exportación entrega texto, fuentes y medios; respaldo incluye datos y medios.
- No se cobran servicios ni se exponen claves.
- IA, VS Code y terminal pueden continuar desde esta misma carpeta.

## 2026-10-27 · Dirección vigente: Estudio Spotmi

El propietario confirmó que el centro de producción vive en Ezra y se conecta a Spotmi; Astra es el modelo de Codex. Se añade /azra/produccion para administración, con 11 especialidades, encargos persistentes, cadena por versiones, revisión, calendario y exportación. Los otros negocios conservan sus datos y permisos.

El propietario pidió desvincular Metricool y HighLevel: no reintroducirlos como dependencia del producto. El plugin Metricool se desvinculó de Codex; GoHighLevel no estaba instalado. En el código solo había un contrato futuro de GHL: se sustituyó por estados de conexión directa. No se revocaron accesos sociales en Meta ni se cancelaron suscripciones.

La lectura de Spotmi usa sus fichas públicas y la clave anónima, nunca service role. Dominio confirmado: https://spotmi.com.sv. Los adaptadores locales de Codex y Claude usan la sesión del propietario, con comandos/archivos/plugins desactivados y búsqueda pública solo para el cazador. No activar una API facturada automáticamente. Gemini sigue detrás de configuración explícita. Toda entrega vuelve a revisión; no se publica en redes desde esta versión.

Guía vigente y límites: docs/ESTUDIO_SPOTMI.md. La documentación anterior conserva el historial; las decisiones de este apartado prevalecen para el nuevo estudio.

## 2026-10-27 · Una sola interfaz activa

Por solicitud expresa del propietario, Estudio Spotmi es la única interfaz. Todas las cuentas entran en `/azra/produccion`; las cuentas de negocio ven el nuevo diseño en modo de vista y administración mantiene las funciones privadas. Las rutas anteriores de chat, contenido, bot, agencia y configuración redirigen al estudio. No reactivar el shell, CSS ni presentación arcade anteriores. La pantalla de acceso también usa la nueva paleta. Los datos y permisos originales se conservan.

Verificado: 71 pruebas locales, 6 integraciones, lint, TypeScript y build. Las integraciones cubren las redirecciones, el acceso nuevo y el aislamiento entre cuentas con datos de prueba.
