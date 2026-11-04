# Migración a Clerk · estado actual

Actualizado: 5 de octubre de 2026.

La autenticación del panel ezrá ya usa Clerk en desarrollo. Existe una sola pantalla de correo y contraseña; el servidor vincula la identidad verificada con un registro privado local y decide si abre `Mi administración`, `Sgmotos` o `motoxspress`. El cliente nunca envía su organización como autoridad.

## Aplicación y cuentas de prueba

- Aplicación de Clerk: `app_3KHfIg7Datms7rYtjDmSok72Wlf`.
- Instancia: desarrollo (`dev`), nunca producción.
- Correos de las cuentas: guardados solo en `data/access.json` (no versionado): uno de administración y uno por cliente.
- Las contraseñas las define cada titular en Clerk; nunca se escriben en el repositorio. Las contraseñas temporales usadas en la prueba deben cambiarse antes de cualquier uso real.
- Los tres correos ya tienen una cuenta Clerk con contraseña habilitada. El primer inicio de sesión verificado enlaza su `userId` en `data/access.json`.

No se imprimió ni se versionó `.env.local`. Sus claves de desarrollo fueron generadas por el CLI y permanecen locales.

## Qué se implementó

- `@clerk/nextjs`, `ClerkProvider` y localización `esMX` en `src/app/layout.tsx`.
- Pantallas `/sign-in` y `/sign-up` con el componente oficial, adaptadas a la identidad visual de ezrá.
- `src/proxy.ts` con `clerkMiddleware`, protección de API, comprobación de origen y corrección del auto-rewrite de Next 16 en loopback.
- `src/lib/auth.ts` para leer `auth()`/`currentUser()`, exigir correo verificado y enlazar identidades.
- `src/lib/access-store.ts` para autorización privada, asignación de correos y revocación inmediata al reasignar un cliente.
- Los endpoints locales antiguos de login, logout y setup responden `410`; no quedan dos puertas de entrada activas.
- La interfaz muestra el `UserButton`, selector de negocio y paneles aislados. El propietario puede cambiar los correos de cliente desde su panel.
- Se conservaron los datos privados existentes y las automatizaciones simuladas; no se activó publicación social, WhatsApp, Gemini ni facturación.

## Verificación

Pasaron `npm run check`, `npm run build`, `npm run test:integration` (5 pruebas HTTP) y `git diff --check`. Las pruebas de integración usan un fixture Clerk offline para verificar tokens, aislamiento, correos no verificados, reasignación y fallos del Backend API; no sustituyen la prueba manual de las tres cuentas reales.

## Siguiente paso

Iniciar sesión en `http://127.0.0.1:3000/sign-in` con cada correo y confirmar que abre su panel. Después cambiar las contraseñas temporales desde Clerk, completar la revisión visual móvil y continuar con catálogo y publicaciones guiadas. Mantener la fase actual como preparación y exportación manual.
