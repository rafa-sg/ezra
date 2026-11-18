# Granjas Spotmi · capacidades y límites

| Implementado | Simulado en pruebas | Verificado de verdad | Bloqueado externamente |
|---|---|---|---|
| Granjas, recetas, nodos/conexiones, inspector, guardado y versiones | Datos y cuentas de prueba aislados | CRUD y permisos HTTP; UI móvil 360/390 sin scroll lateral | Ninguno para uso local |
| Cola SQLite, pausa, reanudación, cancelación, manual e importación | Respuestas de IA y fuentes de tests | Persistencia, bloqueo de concurrencia y pasos manuales | IA real requiere sesión/cuota; Gemini permanece deshabilitado |
| Personajes según estado real y traspaso de artefactos | No se inventa progreso | Estados del backend se consultan cada 2/10 segundos | El Mac debe estar encendido |
| Render ffmpeg/ffprobe | Imagen de prueba generada localmente | Archivo MP4 real en las pruebas aisladas | Medios reales y permisos los aporta el propietario |
| Instagram Login y Facebook Pages: conectar/verificar/desconectar | OAuth y permisos con red sustituida | No se comprobó una cuenta real ni un envío real | Aplicaciones, claves, OAuth y permisos; Instagram imagen necesita URL pública autorizada |
| TikTok: envío de borrador | Proveedor simulado | Sin cuenta ni subida real verificadas | Aprobación video.upload; Direct Post bloqueado para uso interno |
| Spotmi: lectura pública y adaptador editorial de propuestas | RPC editorial simulada | Lectura pública comprobada previamente | Migración pendiente de aplicar, cuenta editorial habilitada y sesión propia de Supabase |
| Aprobación por hash, simulación local y autorización por destinos | Envíos y recibos de proveedores simulados | Invalidación de versiones, idempotencia y resultados desconocidos en tests | El propietario debe aprobar contenido y cuentas antes de todo envío real |
| Consumo de Gemini (registro, presupuesto, tarifas) | Gemini simulado | Pantalla y pruebas; ninguna llamada real a Gemini en esta sesión | Tarifas reales las escribe el propietario |
| Granja «Eventos de El Salvador» (cazador + verificador sin IA) y bandeja | Gemini y páginas simuladas | Flujo completo en pruebas; navegador aislado 1440/390 sin desborde | `EZRA_PRODUCCION_IA=1`; ticketeras y recintos se agregan como dominios |
| Propuestas a Spotmi (RPC, idempotencia, estado) | Supabase simulado, incluido fallo de red | No: falta aplicar 20261103 y habilitar la cuenta editorial | SQL en `work/supabase-*.sql`; `SPOTMI_EDITORIAL_*` |
| Post de Instagram (texto + PNG 1080×1350) | Gemini simulado; PNG real con next/og | PNG real medido en pruebas | Se sube a mano; Ezra no usa la API de Instagram |
| Horario diario (tarea perdida, una vez por día, encadenado, pausa por presupuesto) | Reloj simulado | Pruebas | La Mac encendida con sesión abierta; LaunchAgent sin instalar |

## Uso

1. Abre Granjas y elige una receta o una granja vacía.
2. Configura objetivo, canales y dominios permitidos en Personalizar. Selecciona personajes para asignar instrucciones, fuentes y proveedor.
3. Conecta por arrastre o desde el inspector. Alt + flechas mueve un nodo. Guarda antes de ejecutar.
4. El diálogo de ejecución enumera los pasos de IA. Trabajar en manual no activa Gemini.
5. La granja espera resultados manuales, medios, revisión o autorización cuando corresponde. La vista previa y la comprobación sin red no publican.
6. Conexiones muestra requisitos, cuenta, capacidades y último resultado real. El botón Conectar abre la guía si falta configuración.

## Almacenamiento y respaldo

- JSON de encargos: data/produccion-spotmi.json.
- Granjas, cola, versiones, revisiones y piezas: data/granjas/granjas.sqlite.
- Archivos: data/granjas/medios. Conexiones muestra las rutas absolutas y conteos del backend.
- El respaldo de base descargable excluye tokens; los medios deben respaldarse aparte. No es un respaldo en la nube.
- Los tokens, cuando se configure OAuth, se cifran con EZRA_TOKEN_KEY. No usar claves reales en documentación, prompts o Git.

## Primera prueba

El script `node --env-file-if-exists=.env.local --import tsx scripts/granjas-primera-prueba.ts --encargo=UUID --confirmar-prueba-local` utiliza el backend de la app. Rechaza otra cola activa, no ejecuta IA/render ni procesa envíos remotos. Crea una receta personalizada: la redacción prepara una vista previa mientras la revisión de hechos sigue pendiente. Nunca llama a aprobar ni autorizar. El texto viene del encargo elegido; si no existe, no inventa un reemplazo. El informe se guarda fuera de data/, en work/.

La fecha de la ficha turística debe contrastarse con el anuncio original de Instagram. Faltan la imagen autorizada y las cuentas de destino. No hay autorización para publicar esta pieza.

## Spotmi · SQL pendiente

Migración: supabase/migrations/20261103_propuestas_ezra.sql. Ataques: supabase/tests/propuestas_ezra.sql. Ambos están en spotmi-web y NO se aplicaron/ejecutaron. Antes de activarlos: revisión, pruebas en una base aislada, aplicación autorizada y regeneración de tipos. El cliente editorial solo propone pending; un founder habilita cuentas y el equipo decide la publicación.

## Eventos de El Salvador e Instagram (17 nov 2026)

### Flujo diario
1. **Eventos de El Salvador** (Granjas): el Cazador usa Gemini con búsqueda de Google y devuelve JSON; el Verificador, sin IA, lee cada página fuente y deja en la bandeja solo lo nuevo. Fecha, hora y precio que no aparecen en la fuente quedan «por confirmar». Fuentes iniciales: `elsalvador.travel` y `gob.sv` (MITUR, Cultura, ISTU, alcaldías). Agrega ticketeras y recintos en Personalizar › dominios. Redes sociales siempre bloqueadas.
2. **Eventos** (menú): revisa, aprueba, descarta con motivo o edita. «Enviar a Spotmi» crea una propuesta `pending` (solo eventos aprobados con fecha confirmada). Sin Spotmi: «Copiar ficha» o exporta CSV/JSON del día.
3. **Post para Instagram** (Granjas): toma eventos aprobados con fecha confirmada y sin post; el Redactor (Gemini) escribe el texto con las reglas y, si falla dos veces, usa la plantilla sin IA; el Diseñador arma el PNG 1080×1350 en local. Todo queda en Eventos › Posts de Instagram: Descargar imagen, Copiar texto, Marcar como subido a IG (pega el enlace).
4. **Consumo**: tokens de hoy, semana y mes, 30 días, por granja, por paso y las 20 llamadas más caras. Presupuesto diario y mensual (obligatorio para programar granjas con Gemini) y tarifas por modelo.

### Horario
En el detalle de cada granja: activa, hora (El Salvador), días, máximo por día y, para Instagram, la cuenta de destino. «Cuándo empieza» puede ser «Después de «Eventos de El Salvador»». El trabajador revisa cada minuto; si la Mac estaba dormida, corre una vez al despertar y nunca dos veces el mismo día. Con el presupuesto agotado, la granja queda en pausa («presupuesto agotado») hasta el día o mes siguiente.

### Trabajador permanente (LaunchAgent, no instalado)
- Instalar: `bash scripts/trabajador-instalar.sh` (escribe `~/Library/LaunchAgents/com.spotmi.ezra.trabajador.plist` desde `ops/macos/`, arranca al iniciar sesión y se reinicia si se cae). Registro: `~/Library/Logs/ezra-trabajador.log`.
- Con el LaunchAgent instalado, pon `EZRA_GRANJAS_TRABAJADOR=0` en `.env.local` y reinicia `npm run dev` para no tener dos trabajadores (no duplicarían el día, pero sí la concurrencia).
- Desinstalar: `bash scripts/trabajador-desinstalar.sh`.
- Despertar la Mac 5 minutos antes: `sudo pmset repeat wakeorpoweron MTWRFSU 04:25:00`. Comprobar: `pmset -g sched`. Quitar: `sudo pmset repeat cancel`. Debe estar conectada a la corriente; con FileVault, después de reiniciar hay que iniciar sesión una vez.

### Prueba real (cuando exista la cuenta editorial)
`node --env-file-if-exists=.env.local --env-file-if-exists=.env.meta.local --import tsx scripts/eventos-prueba-real.ts --confirmar --cazar` (máximo 3 eventos) → aprueba uno en la bandeja → `--enviar=<id>` → `--post` (1 post). Informe con tokens e ids en `work/prueba-real-eventos.json`.
