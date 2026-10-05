# Estado y relevo

Actualizado: 4 de octubre de 2026.

## Completado

- Piloto local con seis pantallas y diseño adaptable.
- Persistencia, biblioteca de medios, fuentes, revisión editorial e historial.
- Calendario de fechas previstas, exportación y respaldo.
- Revisión independiente por Claude Code y corrección de cinco hallazgos.
- Análisis estático, tipos, 15 pruebas de dominio/persistencia, compilación y prueba HTTP de integración aprobados.
- Documentación común para Codex, Claude y Gemini.
- Lado de ezrá para la prueba simulada de n8n: `data/automation.json`, `POST /api/automation/jobs` y `POST /api/automation/results`, con secretos separados en `.env.local`. Probado con un receptor falso local (ida y vuelta, receptor apagado, secretos incorrectos o ausentes, resultado repetido y reinicio). Ver DECISIONS.

## Relevo a Claude solicitado por el usuario

Leer `docs/CLAUDE_HANDOFF.md`. El usuario pidió continuar en Claude y compartir la misma carpeta. Codex prepara un punto de recuperación y una copia del contexto/código para el chat Spotbot de Claude. No hay sincronización automática de conversaciones. No editar simultáneamente con otro agente.

## Siguiente hito

1. Completar una pasada visual de calendario, biblioteca, ajustes y móvil. Los detalles de lo ya probado están en `docs/VALIDATION.md`.
2. Probar con el propietario una semana de contenido de Spotmi y fuentes realmente revisadas.
3. Mejorar los problemas observados sin introducir servicios facturados.
4. n8n local instalado y prueba simulada de ida y vuelta verificada (ver DECISIONS). Cuenta local de n8n creada, copia de `~/.n8n` en `Documentos/Respaldos-ezra/` y botón «Probar conexión con n8n» en Ajustes (`GET /api/automation/jobs` devuelve el estado sin secretos). Pendiente: revisión visual del botón por el usuario, porque el navegador automatizado no pasa la protección de origen.
5. Metricool Free evaluado (ver `docs/METRICOOL.md`). Siguiente: primera publicación real programada **a mano** en Metricool desde una versión aprobada en ezrá, registrando después el enlace real. Mejoras de exportación propuestas, pendientes de aprobación: `texto.txt` solo con el texto final, aviso de formato JPEG para Instagram y advertencia al exportar una versión no aprobada.
6. Antes de integrar Meta o Gemini, verificar requisitos oficiales actuales y decidir una prueba acotada.

No activar API, despliegue ni publicación externa por leer esta lista. Los USD 20 adicionales siguen disponibles. La carpeta `data/` es privada y no se versiona.
