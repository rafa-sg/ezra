# Ezra · Estudio Spotmi

El centro de producción para tu web Spotmi y piezas de Instagram, TikTok y Facebook vive en `/azra/produccion`. Todas las cuentas entran allí al iniciar sesión; los negocios lo ven en modo de vista y administración mantiene las herramientas privadas. Incluye 11 especialidades, encargos guardados, revisión por versión, planificación local y exportación.

El chat, el panel de contenido, el bot y la configuración del diseño anterior están deshabilitados y sus enlaces redirigen al estudio. La pantalla de acceso también usa el nuevo diseño.

Consulta [la guía del estudio](docs/ESTUDIO_SPOTMI.md) para configurar las IA, leer eventos y spots reales y conocer el alcance de publicación y video. No depende de Metricool ni HighLevel.

**¿Te invitaron a colaborar?** Seguí la [guía desde cero](#colaborar-en-ezra-guía-desde-cero).

---

# Colaborar en Ezra (guía desde cero)

Esta guía es para una persona invitada que nunca abrió Ezra. Al terminar vas a tener la web corriendo en tu computadora, con **tus propios datos de prueba** y **tu propia cuenta de acceso**, vas a poder cambiar algo, probarlo y mandarlo a revisión. No necesitás ninguna cuenta ni dato del propietario.

**Lo que este entorno nunca hace:** publicar en redes, llamar a IA de pago, ejecutar el trabajador de las granjas ni leer los datos reales de nadie. Todo eso está apagado en `compose.yaml`.

## 0. Qué vas a necesitar

- Una cuenta de **GitHub** y la invitación del propietario al repositorio privado (te llega por correo).
- **Docker Desktop** (macOS y Windows) o **Docker Engine** (Linux).
- **Git**.
- Un editor, por ejemplo **Visual Studio Code**.
- Una cuenta gratuita de **Clerk** (el servicio de inicio de sesión), propia, para tus claves de desarrollo.

No hace falta instalar Node.js: viene dentro del contenedor.

## 1. Instalar las herramientas

**macOS**

1. Instalá Docker Desktop desde https://www.docker.com/products/docker-desktop/ (elegí Apple Silicon o Intel según tu Mac) y abrilo. Esperá a que el ícono de la ballena diga «Docker Desktop is running».
2. Abrí la app **Terminal** y escribí `git --version`. Si macOS ofrece instalar las «herramientas de línea de comandos», aceptá.

**Windows 10 u 11**

1. Abrí PowerShell como administrador y ejecutá `wsl --install`. Reiniciá. Al volver se abre **Ubuntu** y te pide un usuario y una contraseña de Linux (son solo de tu computadora).
2. Instalá Docker Desktop y, en *Settings → Resources → WSL integration*, activá **Ubuntu**.
3. A partir de aquí escribí **todos los comandos en la ventana de Ubuntu**, no en PowerShell. Si clonás el proyecto en una carpeta de Windows (`C:\...`), los cambios no se recargan solos en el navegador.
4. En Ubuntu: `sudo apt update && sudo apt install -y git`.
5. Para editar, abrí VS Code e instalá la extensión **WSL**; desde Ubuntu, dentro de la carpeta del proyecto, escribí `code .`.

**Linux (Ubuntu, Debian, Fedora…)**

1. Instalá Docker Engine y el complemento Compose siguiendo https://docs.docker.com/engine/install/ para tu distribución.
2. Agregate al grupo `docker` para no usar `sudo`: `sudo usermod -aG docker $USER` y cerrá sesión y volvé a entrar.
3. Instalá Git con el gestor de paquetes (`sudo apt install git` o `sudo dnf install git`).

**Qué deberías ver:** `docker --version` muestra una versión, `docker compose version` muestra v2.24 o posterior y `git --version` muestra una versión. Si `docker compose version` falla, Docker no está abierto o no está instalado el complemento Compose.

## 2. Aceptar la invitación y clonar

1. Abrí el correo de GitHub y pulsá **Accept invitation** (o entrá a https://github.com/notifications).
2. En la terminal, elegí dónde guardar el proyecto y clonalo:

   ```sh
   cd ~
   git clone https://github.com/rafa-sg/ezra.git
   cd ezra
   ```

   GitHub te pedirá iniciar sesión. Si usás HTTPS, la contraseña es un *token personal* (GitHub → Settings → Developer settings → Personal access tokens), no tu contraseña de GitHub. Otra opción es instalar GitHub Desktop o la herramienta `gh` y ejecutar `gh auth login`.

3. Configurá tu nombre y correo para los commits (los tuyos, no los del propietario):

   ```sh
   git config user.name "Tu nombre"
   git config user.email "tu-correo@ejemplo.com"
   ```

**Qué deberías ver:** una carpeta `ezra` con `README.md`, `Dockerfile`, `compose.yaml` y `src/`. `git status` dice «nothing to commit, working tree clean».

## 3. Configurar tu acceso de desarrollo (Clerk)

Ezra verifica cada sesión con Clerk; no hay forma de saltarse el inicio de sesión. Cada colaborador usa **su propia aplicación de Clerk en modo de desarrollo** (gratis), así no depende de las cuentas del propietario.

1. Creá una cuenta en https://dashboard.clerk.com y una aplicación nueva (cualquier nombre, por ejemplo «Ezra dev»). Dejá activado el inicio con **correo electrónico**.
2. En la aplicación, abrí **Configure → API keys** y copiá la *Publishable key* (`pk_test_…`) y la *Secret key* (`sk_test_…`).
3. En la carpeta del proyecto, copiá la plantilla:

   ```sh
   cp .env.docker.example .env.docker
   ```

4. Abrí `.env.docker` en tu editor y reemplazá `pk_test_reemplazar` y `sk_test_reemplazar` por tus claves.

`.env.docker` está ignorado por Git y por Docker: nunca se sube. No compartas la *Secret key* por chat ni la pegues en un issue. Si el propietario prefiere darte claves de una aplicación de Clerk propia del equipo, que te las pase por un gestor de contraseñas y van en este mismo archivo.

**Qué deberías ver:** `git status` sigue limpio (el archivo nuevo no aparece porque está ignorado).

## 4. Arrancar la web

```sh
docker compose up --build
```

La primera vez tarda unos minutos (descarga Node e instala dependencias). **Qué deberías ver:** durante la construcción, una línea `SQLite v24.18.0 OK`; al final, algo como `▲ Next.js 16…` y `✓ Ready`. Dejá esa terminal abierta: ahí aparecen los registros de la web.

Abrí **http://127.0.0.1:3000** en el navegador. Deberías ver la pantalla de inicio de sesión de Ezra. La web solo responde en tu computadora; otros equipos de tu red no pueden entrar.

## 5. Datos de ejemplo y tu cuenta de prueba

Abrí **otra** terminal en la carpeta del proyecto y ejecutá, con un correo de prueba inventado que termine en `+clerk_test@example.com`:

```sh
docker compose exec web npm run demo:datos -- tunombre+clerk_test@example.com
```

**Qué deberías ver:** `Administración: tunombre+clerk_test@example.com` y `Listo: 3 eventos, 1 post y 2 encargos de ejemplo en /datos.` Todo lo creado dice «(ejemplo)».

Después, en el navegador:

1. En la pantalla de acceso, elegí **Registrate** y escribí ese mismo correo.
2. Clerk pide un código: escribí **424242**. Los correos `+clerk_test` son cuentas de prueba de Clerk: no se envía ningún correo y el código siempre es ese (solo en aplicaciones de desarrollo).
3. Entrás a **Inicio** («Tu trabajo, *hoy*.») con los eventos y encargos de ejemplo.

Ese correo quedó como administración solo en **tu** volumen de datos. Si entrás con otro correo, Ezra dirá que la cuenta no tiene acceso: es el control de permisos funcionando.

## 6. Hacer un cambio y verlo

1. Abrí `src/features/azra/messages/es.json` y buscá `"ez_trabajo_l1": "Tu trabajo,"`.
2. Cambiá el texto, por ejemplo a `"Mi trabajo,"`, y guardá.
3. Mirá el navegador: en uno o dos segundos el título de Inicio cambia solo. Si no cambia, recargá la página.

Volvé el texto a como estaba si solo era una prueba (`git checkout -- src/features/azra/messages/es.json`).

## 7. Probar tus cambios

Con la web encendida o apagada, en otra terminal:

```sh
docker compose run --rm web npm run check
```

**Qué deberías ver:** al final `ℹ fail 0` (análisis de código, TypeScript y pruebas unitarias). Para la prueba completa, que además compila y levanta servidores temporales:

```sh
docker compose run --rm web sh -c "EZRA_DIST_DIR=.next-verificar npm run build && EZRA_DIST_DIR=.next-verificar npm run test:integration"
```

**Qué deberías ver:** la compilación termina (puede mostrar 2 advertencias conocidas de `src/instrumentation.ts`) y al final `ℹ fail 0`. Las pruebas usan carpetas temporales dentro del contenedor; no tocan tus datos de ejemplo.

## 8. Apagar

- En la terminal de `docker compose up`, pulsá **Ctrl + C**. O desde otra terminal: `docker compose down`.
- Tus datos de ejemplo quedan en el volumen `ezra_datos` y siguen ahí la próxima vez que ejecutes `docker compose up`.
- Para empezar de cero (borra tus datos de ejemplo y tu cuenta de administración local): `docker compose down -v`.
- Si cambió `package.json` o `package-lock.json` (por ejemplo, después de `git pull`), arrancá con `docker compose up --build`.

## 9. Enviar tu cambio para revisión

1. Antes de empezar, actualizá y creá una rama con un nombre que diga qué hacés:

   ```sh
   git switch main
   git pull
   git switch -c cambio/titulo-de-inicio
   ```

2. Hacé el cambio y probalo (pasos 6 y 7).
3. Revisá qué vas a enviar: `git status` y `git diff`. **No** deberían aparecer `.env.docker`, `data/`, `work/` ni `node_modules/`.
4. Guardá el cambio y subí la rama:

   ```sh
   git add src/features/azra/messages/es.json
   git commit -m "Cambia el título de Inicio"
   git push -u origin cambio/titulo-de-inicio
   ```

5. Git muestra un enlace «Create a pull request». Abrilo (o en GitHub pulsá **Compare & pull request**), contá qué cambiaste y cómo lo probaste, y pulsá **Create pull request**. El propietario lo revisa y decide si lo une.

No subas cambios directamente a `main`.

## Para el propietario: repositorio privado e invitaciones

- El repositorio `rafa-sg/ezra` es privado: solo lo ven las personas invitadas.
- Invitar: en GitHub, **Settings → Collaborators → Add people**, escribí el usuario de GitHub de la persona. Tendrá permiso de escritura (puede crear ramas y pull requests).
- Recomendado: **Settings → Branches → Add branch ruleset** sobre `main` con «Require a pull request before merging», para que nadie suba directo a `main`.
- Revisar: en la pestaña **Pull requests**, abrí el de la persona, mirá **Files changed**, comentá o pulsá **Merge pull request**.
- Una persona invitada puede ver **todas las ramas e historial** del repositorio. Antes de invitar, revisá que no haya datos personales en ninguna rama.
- Para quitar el acceso: **Settings → Collaborators → Remove**.

## Solución de errores habituales

| Lo que ves | Qué hacer |
| --- | --- |
| `Cannot connect to the Docker daemon` | Abrí Docker Desktop y esperá a que diga *running* (en Linux: `sudo systemctl start docker`). |
| `port is already allocated` o `address already in use` en el 3000 | Otra app usa el puerto 3000. Cerrala, o cambiá en `compose.yaml` `127.0.0.1:3000:3000` por `127.0.0.1:3001:3000` y abrí http://127.0.0.1:3001. |
| `env_file … unknown field "path"` | Docker Compose es antiguo. Actualizá Docker Desktop (hace falta Compose v2.24 o posterior). |
| Error de Clerk «Missing publishableKey» o «The publishableKey passed to Clerk is invalid» | Falta `.env.docker` o tiene las claves mal copiadas. Revisalo y reiniciá con `docker compose up`. |
| La página dice «Este piloto solo está disponible en tu computadora» | Abrí exactamente http://127.0.0.1:3000 o http://localhost:3000, no la IP de tu red. |
| Entrás pero dice que tu cuenta no tiene acceso | Ejecutá el paso 5 con el **mismo** correo con el que entraste. Si ya había otro correo configurado, empezá de cero con `docker compose down -v`. |
| El código 424242 no funciona | El correo debe contener `+clerk_test`. En el panel de Clerk, comprobá que la aplicación esté en *Development*. |
| Los cambios no aparecen en el navegador (Windows) | El proyecto está en una carpeta de Windows. Clonalo dentro de Ubuntu (`cd ~` en la ventana de Ubuntu) y trabajá desde ahí. |
| `npm ci` falla al construir | Revisá tu conexión. Si cambiaste dependencias, `package-lock.json` debe estar actualizado. |
| Todo raro después de muchos cambios | `docker compose down` y `docker compose up --build`. Tus datos se conservan. |

## Sin Docker (arranque actual)

Quien ya usa Ezra sin Docker sigue igual: Node.js 22 o posterior, `npm ci` la primera vez y `npm run dev`, con su configuración en `.env.local`. Ese arranque usa la carpeta `data/` del proyecto; el de Docker usa su propio volumen y nunca la toca.

## Qué entra en cada lugar

| | Git (GitHub) | Imagen de Docker | Montado al ejecutar |
| --- | --- | --- | --- |
| Código (`src/`, `tests/`, `scripts/`, `assets/`, `docs/`) | Sí | Sí (copia) | Sí, desde tu carpeta |
| Configuración (`package.json`, `next.config.ts`, `tsconfig.json`…) | Sí | Sí | No (reconstruí si cambia) |
| `node_modules/` | No | Sí (instalado con `npm ci`) | No |
| `.env*` con claves | No (solo las plantillas `.env.example` y `.env.docker.example`) | No | No; `.env.docker` llega como variables de entorno |
| `data/` (datos reales, SQLite, medios, respaldos) | No | No | No; se usa el volumen `ezra_datos` |
| `work/`, `output/`, `handoff/`, `.next*/`, `.claude/`, `.agents/` | No | No | No |

---

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
