# Validación · 4 de octubre de 2026

## Resultado automático

- `npm run check`: análisis ESLint, TypeScript y 15 pruebas aprobadas.
- `npm run build`: compilación de producción aprobada (Next.js 16.3.8).
- `npm run test:integration`: prueba HTTP aprobada contra servidor de producción aislado; persistencia, conflictos, origen, subida, rangos de video, exportación y respaldo.
- Auditoría npm después de la instalación: cero vulnerabilidades reportadas. Es una instantánea, no una garantía futura.

## Pruebas en navegador

Se abrió el resumen, contenido, fuentes y editor. En una copia de prueba (`work/ui-test-data`, puerto 3001) se registró una fuente autorizada, se creó una publicación de Facebook solo texto, se vinculó la fuente, se envió a revisión y se aprobó tras marcar las tres comprobaciones. Se observaron confirmación de guardado y el historial de aprobación.

El resumen se inspeccionó en escritorio y en pantalla estrecha. Se corrigió la visibilidad del botón del menú y el contraste de la ilustración móvil. Se añadió «La revisé hoy» para registrar la fecha de una fuente con un clic. La automatización del navegador se interrumpió durante la prueba final de editar después de aprobar; esa regla está cubierta por las pruebas automáticas, pero no se declara completada esa última comprobación visual.

Los datos originales de `data/` no se utilizaron para las mutaciones de las pruebas.

## Revisión independiente de Claude Code

Claude revisó en lectura las reglas, archivos, servidor y exportación. Se corrigieron sus cinco hallazgos:

1. Cambiar una fuente reinicia las comprobaciones de todos los borradores afectados.
2. HEIC, AVIF y MOV no se aceptan por error como MP4.
3. El respaldo se transmite progresivamente, limita 1 GB y avisa de medios ausentes.
4. Los medios se transmiten con soporte de rangos de reproducción.
5. Duplicar requiere guardar primero para no perder cambios pendientes.

Las pruebas cubren los cuatro primeros comportamientos; la duplicación tiene una protección explícita en la interfaz. El informe original está en `work/claude-review.md`.

## Límites

Sin conexión a Meta, Gemini ni analítica social. Sin autenticación pública, nube ni ejecución desatendida. No se probó un flujo real de publicación externa y no se gastó dinero del presupuesto del proyecto.
