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
4. Instalar o confirmar n8n local y crear el flujo de prueba que llame a los endpoints ya preparados. Comprobar antes si el usuario ya tiene una instancia y decidir cómo se conecta (host o Docker; ver la nota sobre `proxy.ts` en DECISIONS). Aún no hay botón en la interfaz para lanzar la prueba.
5. Antes de integrar Meta o Gemini, verificar requisitos oficiales actuales y decidir una prueba acotada.

No activar API, despliegue ni publicación externa por leer esta lista. Los USD 20 adicionales siguen disponibles. La carpeta `data/` es privada y no se versiona.
