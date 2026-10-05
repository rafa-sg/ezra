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
