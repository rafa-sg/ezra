---
name: claudeya
description: Relevo documental de Ezra - actualiza AGENTS.md, docs/TASKS.md y docs/DECISIONS.md con el estado real para que otra sesión (Codex o Codex) continúe. Úsala cuando el propietario escriba «Claudeya» o /claudeya (cualquier mayúscula), o pida «deja el relevo» o «actualiza el contexto».
---

# Claudeya · relevo de Ezra

Regla del propietario (AGENTS.md › «Comando de relevo Claudeya»). Es solo documentación: no instalar, desplegar, hacer push ni conceder accesos.

## Antes de escribir

1. `git status --short`, `git log --oneline -15` y la rama actual. Distingue tus cambios de los ajenos (Codex puede estar trabajando a la vez).
2. Lee el bloque «Relevo vigente» de `AGENTS.md`, la sección más reciente de `docs/TASKS.md` y el final de `docs/DECISIONS.md`.
3. Si hubo pruebas en esta sesión, usa sus resultados reales; si no las hubo, dilo (no inventes «check N/N»).

## Qué actualizar

- **`AGENTS.md`, bloque «Relevo vigente» (arriba de todo):** una viñeta nueva con fecha (formato «20 nov · Tema»): objetivo, commits con su hash, archivos clave, migraciones y versión de la base real, decisiones del propietario, pruebas con resultados, limitaciones y el próximo paso concreto. Mantén el estilo compacto de las viñetas existentes. Si el bloque se volvió muy largo, resume viñetas viejas en vez de borrarlas.
- **`docs/TASKS.md`:** sección con fecha, `[x]` para lo hecho y `[ ]` para lo pendiente, y actualiza «Te toca (propietario)».
- **`docs/DECISIONS.md`:** solo decisiones nuevas, con su porqué.

## Reglas

- Español, voseo o tú según el archivo (AGENTS.md usa tú neutro).
- Nunca copies secretos, claves, tokens ni datos personales (correos, teléfonos). Las variables de entorno se nombran, no se muestran.
- No borres código ni `data/`. Conserva el contexto anterior útil.

## Entrega

Enlaza los tres archivos con su ruta y deja un mensaje breve, listo para pegar en la siguiente sesión, con: rama, último commit, qué se hizo, qué falta y por dónde seguir.
