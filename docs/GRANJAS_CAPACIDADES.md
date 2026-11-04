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
