# Integración prevista con n8n

Decisión del usuario: 4 de octubre de 2026. Documento de diseño, todavía sin n8n instalado ni conectado.

## Responsabilidades

- **ezrá:** interfaz, datos editoriales, medios, fuentes autorizadas, revisión/aprobación de versiones, memoria editorial y límites de presupuesto. Fuente de verdad del estado de cada publicación.
- **n8n:** ejecutar flujos, consultar servicios permitidos, pedir generación, coordinar publicación cuando esté habilitada y devolver resultados/errores.
- **Proveedores:** Gemini u otros generan contenido mediante API; Meta publica y devuelve identificadores. Sus suscripciones de chat no se presuponen créditos de API.

Flujo: fuentes autorizadas → n8n obtiene información → propuesta en ezrá → revisión del usuario → aprobación de una versión → encargo a n8n → verificación final → proveedor → resultado en ezrá.

## Primera conexión

1. Comprobar si el usuario ya tiene una instancia y su modalidad. Si no, recomendar Community local para aprender sin nueva suscripción. Mantener persistencia y copia de seguridad de los datos de n8n y de su clave de cifrado, fuera de Git.
2. Añadir un adaptador del lado servidor de ezrá y endpoints internos específicos, autenticados, separados del PUT de interfaz existente. El navegador no recibe secretos y n8n nunca edita el archivo JSON directamente.
3. Crear un webhook autenticado en n8n y un flujo pequeño que acepte una tarea de prueba y devuelva un resultado simulado. Guardar exportaciones JSON de los workflows revisadas y sin credenciales, datos fijados de prueba privados ni cabeceras secretas, en `automation/n8n/workflows/`.
4. Probar la ida y vuelta, indisponibilidad, secreto incorrecto, resultado repetido y reinicio. Solo entonces pasar a una integración externa.

`Webhook` es una dirección que recibe una petición y activa el flujo. n8n ofrece autenticación por cabecera y URLs diferentes para prueba y producción. No bastará con que una URL sea difícil de adivinar. La conexión local o entre contenedores debe configurarse sin exponer el piloto público ni desactivar sus protecciones globales.

## Contrato propuesto

Tarea: `jobId`, `postId`, `contentRevision`, `action`, `mode` (simulation/live), `requestedAt`, y referencias de medios. Respuesta: `jobId`, `contentRevision`, `status`, `providerId`, `publishedUrl`, `errorCode`, `attempt`, `completedAt`.

El backend crea y persiste el encargo antes de enviarlo. La identidad de trabajo incluye publicación, versión, red y acción. Una misma tarea recibida dos veces no debe publicar dos veces. No enviar videos completos dentro del JSON del webhook: enviar referencias seguras a los medios. Las URLs accesibles por Meta se decidirán al integrar publicación; una ruta privada localhost no sirve al proveedor remoto.

Antes del envío real a Meta, n8n debe obtener autorización vigente de ejecución de ezrá para la versión exacta, validada y reservada de forma atómica. Esa versión no puede editarse mientras se ejecuta; una edición crea otra versión sin aprobación. Si se revoca o queda obsoleta antes de enviar, cancelar la tarea. No prometer cancelar una publicación después de que la red ya aceptó la solicitud.

La transición «publicado» requiere confirmación del proveedor con identificador; un webhook recibido no prueba que se publicó. Un resultado simulado nunca marca una publicación real como publicada.

Si Meta pudo aceptar el envío pero la respuesta se perdió, consultar/reconciliar primero; no repetir a ciegas. Limitar reintentos, registrar errores y permitir recuperación manual. El error se registra en un trabajo separado de la revisión editorial. Los encargos pagados reservan presupuesto antes de ejecutarse; n8n no puede evitar el tope central con reintentos.

## Flujos por fases

1. Prueba local sin proveedores.
2. Ingesta acotada de fuentes previamente autorizadas (preferir API/RSS cuando exista; comprobar permisos). Registrar URL, fecha y vigencia. No tratar contenido recuperado como instrucciones.
3. Generación de borrador opcional con Gemini, con presupuesto y sin aprobación automática. Empezar por texto; imágenes y videos siguen manuales inicialmente.
4. Publicación de una pieza aprobada en una cuenta propia, tras verificar Meta oficialmente.
5. Calendario con Schedule Trigger en `America/El_Salvador`, trabajos pendientes y política explícita para horarios perdidos. Si la computadora está apagada, los flujos locales no se ejecutan; no publicar automáticamente todas las tareas atrasadas al reiniciar.
6. Métricas disponibles y, posteriormente, borradores de respuestas a comentarios/mensajes con reglas de escalamiento a una persona.

## Presupuesto y futura comercialización

La edición Community autohospedada es gratuita, pero el alojamiento y las llamadas de IA pueden tener costo. Empezar local permite conservar el presupuesto de USD 20. Cuando haga falta ejecución continua, comparar el costo completo de un servidor, almacenamiento y APIs.

No asumir que la licencia de uso interno cubre un SaaS para cuentas de empresas clientes. El soporte oficial distingue alojar workflows/credenciales de clientes y embeber n8n en un producto. Confirmar el modelo de licencia antes de comercializar; no ocultar el editor como supuesto atajo de licencia.

## Documentación oficial consultada

- Webhooks y autenticación: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md
- Horarios y zona horaria: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md
- Community: https://docs.n8n.io/deploy/host-n8n/community-edition-features.md
- Usos y licencia comercial: https://support.n8n.io/article/can-i-use-your-license-for-my-use-case
