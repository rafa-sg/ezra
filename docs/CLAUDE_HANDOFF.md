# Relevo para Claude · ezrá / Spotbot

Fecha: 5 de octubre de 2026. Trabaja directamente en `/Users/rafaelsandoval/Desktop/Spotbot`; esta carpeta es la fuente compartida de verdad.

## Objetivo actual

Ezrá es un panel comercial para dos clientes piloto, **Sgmotos** y **motoxspress**, más el panel privado del propietario. Spotmi queda como archivo histórico. Cada correo abre su panel asignado dentro de una sola pantalla de inicio de sesión. El producto actual prepara, revisa, aprueba, agenda como fecha interna y exporta publicaciones manualmente; todavía no publica en redes ni responde mensajes externos.

## Lee antes de editar

Lee `AGENTS.md`, `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/CLERK_MIGRATION.md` y `docs/VALIDATION.md`. Respeta la carpeta `data/`: contiene información del usuario, no la borres ni la versiones. Una sola IA modifica archivos a la vez.

## Estado implementado

- Clerk está instalado y enlazado a la aplicación de desarrollo `app_3KHfIg7Datms7rYtjDmSok72Wlf`.
- Existen cuentas de prueba en Clerk dev para administración y para cada cliente; sus correos están solo en `data/access.json` y las contraseñas las gestiona cada titular en Clerk.
- `src/components/access-screen.tsx`, `/sign-in/[[...sign-in]]` y `/sign-up/[[...sign-up]]` usan UI oficial de Clerk en español.
- `src/components/commercial-app.tsx`, `src/lib/auth.ts` y `src/lib/access-store.ts` resuelven identidad y aislamiento por organización.
- `src/proxy.ts` protege API y navegación local; conserva la ruta especial del callback simulado de n8n.
- `src/lib/businesses.ts` crea `owner-main`, `sgmotos-main` y `motoxspress-main`, y filtra cada directorio en el servidor.
- Catálogo y publicaciones guiadas ya tienen producto, variante, color, precio, promoción, fuente, medios propios y canales manuales.
- Las rutas antiguas de autenticación están retiradas con `410`; no reintroducir sesiones locales ni contraseñas en JSON.

## Verificación realizada

`npm run check`, `npm run build`, `npm run test:integration` y `git diff --check` pasan. La integración tiene 5 pruebas HTTP y fixtures RSA que verifican tokens Clerk, expiración, origen incorrecto, correo no verificado, aislamiento entre clientes, persistencia y reasignación. Falta comprobar visualmente los tres inicios de sesión reales en el navegador.

## Próxima tarea recomendada

1. Ejecuta `git status` y revisa los archivos modificados sin reiniciar el trabajo.
2. Levanta el servidor con `npm run dev` y prueba los tres correos en `/sign-in`; verifica que cada uno vea solo su negocio y que administración vea los tres.
3. Ejecuta nuevamente `npm run check`, `npm run build` y `npm run test:integration` después de cualquier cambio.
4. Termina la pasada móvil y mejora el flujo de catálogo → variante → promoción → canales → revisión.
5. Mantén publicación y mensajería manuales. Cualquier Meta, WhatsApp, n8n productivo, Gemini o cobro necesita una decisión nueva y permisos oficiales.

## Comando de continuidad para Claude

Trabaja en `/Users/rafaelsandoval/Desktop/Spotbot`. Lee `AGENTS.md`, `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/CLERK_MIGRATION.md` y `docs/CLAUDE_HANDOFF.md`. Continúa ezrá para Sgmotos, motoxspress y Mi panel; no lo conviertas de nuevo en Spotmi ni reconstruyas desde cero. Verifica primero los tres inicios de sesión Clerk en desarrollo y el aislamiento de paneles. Conserva `data/`, no leas ni imprimas `.env.local`, no publiques ni envíes mensajes a redes sociales y ejecuta los tres comandos de verificación antes de entregar cambios.
