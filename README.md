# Ezra · Estudio Spotmi

El centro de producción para tu web Spotmi y piezas de Instagram, TikTok y Facebook vive en `/azra/produccion`. Todas las cuentas entran allí al iniciar sesión; los negocios lo ven en modo de vista y administración mantiene las herramientas privadas. Incluye 11 especialidades, encargos guardados, revisión por versión, planificación local y exportación.

El chat, el panel de contenido, el bot y la configuración del diseño anterior están deshabilitados y sus enlaces redirigen al estudio. La pantalla de acceso también usa el nuevo diseño.

Consulta [la guía del estudio](docs/ESTUDIO_SPOTMI.md) para configurar las IA, leer eventos y spots reales y conocer el alcance de publicación y video. No depende de Metricool ni HighLevel.

El material siguiente documenta el piloto anterior y se conserva como historial. Los negocios y sus datos no se borraron.

---

# ezrá · el estudio editorial de Spotmi

Un piloto local para preparar, revisar y organizar contenido turístico de El Salvador. **Gasto adicional de esta versión: USD 0.** No necesita claves de API ni cuentas nuevas.

## Abrir el estudio

Desde Warp o la terminal de VS Code, dentro de esta carpeta:

```sh
npm install
npm run dev
```

Abre **http://127.0.0.1:3000**. En este equipo las dependencias ya están instaladas; normalmente basta `npm run dev`. También puedes abrir `Abrir ezra.command` en macOS. Mantén abierta la terminal mientras usas el estudio. Para detenerlo pulsa **Control + C**.

Requisito: Node.js 22 o posterior. No hace falta comprar dominio ni hosting. Si el puerto 3000 está ocupado, Next indica otro puerto en la terminal.

## Lo que ya funciona

- Resumen con métricas de trabajo internas, cuatro historias de ejemplo e ilustraciones originales claramente etiquetadas.
- Crear, editar, buscar, filtrar, duplicar y eliminar borradores.
- Subir JPG, PNG, WebP, MP4 y WebM de hasta 50 MB; registrar si son propios, generados con IA o autorizados.
- Vincular fuentes, anotar su revisión y vigencia y pausarlas.
- Revisar hechos, derechos y marca antes de aprobar **esa versión**.
- Invalidar la aprobación y las comprobaciones al editar contenido, fuentes o criterios de marca.
- Rechazar con motivo y conservar decisiones en la memoria editorial.
- Asignar fechas previstas en hora de El Salvador y verlas en el calendario.
- Descargar el texto, las fuentes y los archivos de una publicación en ZIP.
- Registrar el enlace después de publicar manualmente en la red social.
- Descargar un respaldo de los datos y medios. Guardar cambios de forma persistente al recargar o reiniciar.

**No están conectadas las redes sociales ni una API de IA.** La fecha prevista no envía contenido. Las cifras del resumen cuentan tareas del estudio; no son seguidores, alcance ni rendimiento real. Las fuentes de ejemplo no se han consultado y no verifican borradores reales. Los videos se reproducen silenciados inicialmente, con controles en la biblioteca.

## Prueba tu primera historia

1. En **Fuentes**, añade una fuente propia, abre su sitio por tu cuenta, registra lo que comprobaste y autorízala con una fecha de revisión.
2. En **Contenido**, crea un borrador, escribe el texto, elige red/formato y sube material propio, generado o con permiso. Para una prueba sin archivos, selecciona Facebook → Solo texto.
3. Guarda. En **Fuentes y revisión**, vincula tu fuente y envía a revisión.
4. Completa las tres comprobaciones y aprueba. Si cambias el contenido, guarda y revisa de nuevo.
5. Elige una fecha/hora y pulsa **Guardar fecha prevista**. Exporta el ZIP y publica manualmente.
6. Regresa al borrador, pega el enlace real y pulsa **Registrar publicación manual**.

Puedes practicar editando los ejemplos. Para convertir una idea de ejemplo en contenido real, usa **Duplicar como borrador real**, sustituye la fuente de demostración y agrega tus medios.

## Dónde se guarda todo

| Carpeta/archivo       | Contenido                               | ¿Va a GitHub? |
| --------------------- | --------------------------------------- | ------------- |
| `src/`                | Aplicación y reglas de revisión         | Sí            |
| `docs/`               | Bases del producto, decisiones y relevo | Sí            |
| `tests/`              | Pruebas automáticas con datos aislados  | Sí            |
| `data/workspace.json` | Borradores, fuentes, marca e historial  | **No**        |
| `data/media/`         | Fotos y videos                          | **No**        |
| `work/`               | Pruebas y archivos temporales           | No            |

Los datos se crean automáticamente la primera vez que abres la app. Borrar `node_modules/` no borra publicaciones; borrar `data/` sí. El sistema conserva un archivo ilegible en lugar de reemplazarlo silenciosamente por ejemplos. El piloto usa un único proceso local, no está preparado para varios usuarios ni sincronización entre computadoras.

## Respaldar y mover

En **Ajustes → Descargar respaldo completo** obtienes un ZIP con datos, medios e instrucciones. Por encima de 1 GB, detén el servidor y copia manualmente la carpeta `data/` completa. Si falta un archivo en disco, el ZIP se llama `incompleto` e incluye una advertencia y todos los archivos disponibles.

Para restaurar: detén el servidor, conserva una copia del `data/` actual, extrae el respaldo y copia su `workspace.json` y `media/` dentro de `data/`. Reinicia. No mezcles los medios de un respaldo con el JSON de otro sin comprobar sus referencias.

Para mover todo el proyecto, copia esta carpeta incluyendo `data/`, excluye `node_modules/`, `.next/` y `work/`, y ejecuta `npm install` en el otro equipo. Si lo clonas desde GitHub, restaura también tu respaldo: **GitHub no contiene tus borradores ni medios.**

## Trabajar con Codex, Claude y VS Code

Abre esta misma carpeta. El punto de entrada común es **AGENTS.md**. `CLAUDE.md` y `GEMINI.md` remiten a las mismas reglas. Pide a la siguiente IA:

> Lee AGENTS.md, docs/PROJECT_BRIEF.md, docs/DECISIONS.md y docs/TASKS.md. Revisa git status y las pruebas antes de cambiar nada. Continúa el hito indicado, manteniendo el piloto local sin gasto ni publicación automática.

Una IA edita a la vez. Otra puede revisar en lectura. Un proyecto o archivo subido al chat de Claude es una copia: no se sincroniza automáticamente con esta carpeta.

## Verificar cambios

```sh
npm run check
npm run build
npm run test:integration
```

`check` ejecuta análisis de código, TypeScript y pruebas de dominio/persistencia. Las pruebas de integración arrancan temporalmente el servidor en el puerto **3101** y usan una carpeta independiente en `work/`. No editan los datos reales. La revisión visual se documenta en `docs/VALIDATION.md`.

## Límites importantes

- Ejecutar solo en esta computadora, con los comandos incluidos. No exponer a Internet ni usar túneles: aún no hay inicio de sesión.
- Los archivos se validan por firma básica, no se transcodifican ni se analiza su contenido. HEIC, AVIF y MOV deben convertirse antes de subirlos. Revisa los requisitos reales de cada red al publicar.
- La memoria registra decisiones; no entrena ni llama a modelos. Ninguna cuenta de IA comparte su memoria con otra automáticamente.
- El presupuesto de USD 20 en Ajustes es informativo: esta versión no genera gastos ni consulta facturas externas.
- No hay restauración automática desde la interfaz, sincronización en nube, edición de video ni borrado de medios desde la biblioteca en esta primera versión.
- Futuro acceso comercial requiere autenticación, permisos, aislamiento de datos, una base de datos y un ejecutor de publicaciones confiable.

Consulta `docs/ROADMAP.md` para los siguientes pasos. La implementación actual es un piloto funcional; no un servicio listo para vender.

## Automatización con n8n

Se usará n8n como motor de integraciones. La arquitectura está documentada en `docs/N8N_ARCHITECTURE.md`; todavía no está instalado ni conectado. ezrá conservará los datos y la aprobación editorial. El primer flujo será una prueba local simulada.

## Automatización local con n8n (prueba simulada)

n8n está instalado fuera del proyecto, en `~/n8n-local` (versión fija 2.41.6). Sus datos y su clave de cifrado viven en `~/.n8n`: **inclúyelos en tus copias de seguridad y nunca los subas a Git**. Sin esa clave, las credenciales guardadas en n8n no se pueden recuperar.

1. Abre `automation/n8n/Abrir n8n.command`. n8n queda en **http://127.0.0.1:5678**, solo en esta computadora y sin telemetría. La primera vez que abras esa dirección, n8n te pedirá crear tu cuenta local.
2. Abre ezrá como siempre. Los secretos y la dirección de n8n están en `.env.local`, fuera de Git; el navegador nunca los recibe.
3. El flujo «ezrá · prueba de conexión simulada» (`automation/n8n/workflows/`) recibe el encargo, comprueba el secreto y devuelve un resultado simulado. En el historial verás «Prueba de conexión simulada». **No publica nada ni cambia ninguna publicación.**

Para probar la conexión: **Ajustes → Cuentas e integraciones → Probar conexión con n8n**. La etiqueta muestra el resultado de la última prueba («Conectado», «No entregado», etc.).
