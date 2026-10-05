# Decisiones

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
