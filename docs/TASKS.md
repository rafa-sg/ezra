# Estado y relevo

Actualizado: 5 de octubre de 2026.

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
