---
name: verificar
description: Verificación completa de Ezra antes de un commit o al cerrar una fase - check (lint, tipos, unitarias), build aislado en .next-verificar, integración HTTP y restauración de tsconfig.json y next-env.d.ts. Úsala cuando el propietario escriba /verificar o pida «verifica todo», «corre las pruebas» o «¿está listo para commit?».
---

# Verificar Ezra

Corre los tres niveles de verificación del proyecto sin tocar `data/` ni el servidor del puerto 3000, y reporta el resultado real.

## Pasos

1. **Check:** `npm run check` (lint, TypeScript y pruebas unitarias). Si falla, detente y reporta el error exacto; no sigas al build.
2. **Respaldo de archivos que el build reescribe:** copia `tsconfig.json` y `next-env.d.ts` al scratchpad de la sesión.
3. **Build aislado:** `EZRA_DIST_DIR=.next-verificar npm run build`. Las 2 advertencias de `src/instrumentation.ts` (node:fs y node:process en Edge) son conocidas; cualquier otra advertencia o error se reporta.
4. **Restaurar** `tsconfig.json` y `next-env.d.ts` desde el respaldo, siempre, aunque el build falle. Confirma con `git status --short tsconfig.json next-env.d.ts` que no quedaron cambios.
5. **Integración:** `EZRA_DIST_DIR=.next-verificar npm run test:integration`. Sin la variable, `next start` busca `.next` y las pruebas fallan con 404: no es un error del código.
6. **Limpiar:** `rm -rf .next-verificar`.

## Reporte

Una línea por nivel con números reales: «Check N/N», «Build correcto (2 advertencias conocidas)», «Integración N/N». Si algo falló, muestra la salida relevante y no digas que está listo. No hagas commit salvo que el propietario lo pida.

## Cuidados

- Compilar puede reiniciar el `next dev` del puerto 3000; avísalo si el servidor estaba corriendo.
- Las pruebas usan carpetas propias en `work/`; nunca apuntes `EZRA_DATA_DIR` a `data/`.
