# Perfil del navegador · 27 de noviembre de 2026

Medición directa con Performance y Network de DevTools en Brave, sobre el servidor existente en `127.0.0.1:3001`. Recorrido: Inicio → Eventos → buscar un evento → abrir su ficha. No se reinició el servidor ni se editaron eventos.

## Condiciones y alcance

- Servidor de desarrollo y sesión administrativa existente. Secciones ya visitadas; no es una carga fría de producción.
- Al comenzar estaba activa la simulación Fast 4G. Se desactivó para las muestras siguientes; CPU sin limitación y caché del navegador habilitada.
- La traza de interacción se tomó con emulación responsive y DevTools abiertos. La lectura posterior de Network se hizo sin emulación de dispositivo. No se deben mezclar ambas como un único experimento de FPS.
- Hubo pausas entre acciones manuales. No usar la duración total de la grabación ni su LCP de navegación suave (16,90 s) como tiempo de apertura de la sección: incluyen el tiempo hasta la siguiente acción del recorrido.
- Los resultados son muestras individuales, sin percentiles ni comparación controlada antes/después. DevTools y otras pestañas abiertas pueden influir.

## Resultados observados

| Medida | Resultado | Interpretación limitada a la muestra |
| --- | --- | --- |
| INP del tramo Inicio | 32 ms | Respuesta de interacción observada en ese tramo. |
| INP del tramo Eventos | 202 ms | Demora de entrada 180 ms, procesamiento redondeado a 0 ms y presentación 21 ms. |
| Intervalo de la interacción, 15,858–16,160 s | 212 ms de scripting, 4 ms de rendering, 3 ms de painting, 4 ms de sistema | El coste seleccionado se concentra en JavaScript; la atribución principal aparece como no atribuida. No identifica por sí sola una función culpable. |
| Cuadro seleccionado durante la transición, en 6,46 s | 59,41 ms | Duración de un cuadro de la pista Frames; supera 16,67 ms de referencia para 60 Hz. No equivale al promedio de FPS del recorrido. |
| Cuadro largo de la misma traza, en 15,84 s | 241,59 ms, marcado Idle frame | Excluido del diagnóstico de cuadros lentos: no contar inactividad como fallo de renderizado. |
| Listado `GET /api/granjas/eventos?vista=resumen…` | HTTP 200, 374 ms | Tiempo total de la solicitud finalizada; otra solicitud de listado se canceló a los 17 ms. No sumar la cancelada al tiempo de apertura. |
| Ficha `GET /api/granjas/eventos?id=…` | HTTP 200, 353 ms en la tabla Network | JSON de 3,3 kB, transferencia de 1,7 kB. |
| Timing de esa ficha | Espera de respuesta 352,44 ms; descarga 0,28 ms; total detallado 354,13 ms | La tabla y Timing muestran diferencias de cómputo/redondeo. La descarga pequeña no explica la mayor parte de la espera. |
| Imagen original de la ficha | HTTP 200, 156 ms, 130 kB | Solicitud aparte del JSON. No sumar sin comprobar si las fases se solapan. |
| Miniaturas observadas | 413–423 ms; cuatro HTTP 304 y una HTTP 200 | Revalidar evita transferir de nuevo el cuerpo, pero conserva un viaje de respuesta. |

## Qué queda demostrado

Persisten esperas de datos y una demora de entrada medible. La descarga del JSON no es el coste dominante de la ficha. El tramo de entrada seleccionado dedica poco tiempo a layout/pintado respecto a scripting. Todavía no se puede afirmar que desapareció el lag ni atribuir los 352 ms a SQLite, Clerk o una función específica.

El contador FPS se activó y retiró; sus lecturas instantáneas durante cambios de viewport/panel no se usan como promedio. No se obtuvo un porcentaje fiable de cuadros perdidos ni una distribución de tiempos de cuadros. El archivo de traza no quedó exportado y verificado en disco; estas cifras se transcriben de las lecturas visibles de DevTools.

## Próximo diagnóstico y mejora

1. Separar con tiempos de servidor la autenticación/proxy, autorización, lectura de ficha y serialización. La espera de respuesta incluye más que la consulta de datos; no debilitar permisos para ocultarla.
2. En `src/features/azra/granjas/eventos.tsx`, la ficha completa se solicita al cambiar el evento abierto y los datos del listado. Evaluar mostrar de inmediato el resumen disponible mientras llega el detalle, con un estado explícito de actualización. Mantener acciones de revisión/publicación basadas en la versión completa y vigente.
3. Atribuir la tarea de JavaScript asociada a los 180 ms de demora de entrada antes de cambiar componentes. Repetir el mismo recorrido con compilación de producción, viewport fijo y varias muestras; informar mediana/p95 y cuadros activos, excluyendo los inactivos.

Al terminar se cerraron el panel de ficha, el monitor, el contador FPS y DevTools. La simulación de red quedó en No throttling. Los cambios de esta sesión en el repositorio son documentales; no se presentan como una optimización implementada.

## Implementación posterior al perfil

Se añadió el resumen inmediato al panel de ficha, sin acciones hasta obtener el detalle completo, y protección ante respuestas abortadas o vinculadas a un listado anterior. Se añadieron tiempos por fase: `Server-Timing` en GET de Eventos y `X-Ezra-Proxy-Duration` separado. Es una mejora de la respuesta visible y una herramienta para atribuir la espera; no demuestra que los 353 ms hayan bajado.

Pasaron lint, TypeScript, 229 pruebas, build aislado y las 9 integraciones. La bandeja filtrada se comprobó en Brave, pero la apertura posterior se interrumpió por cambios de aplicación durante el control. Pendientes: ver el resumen transitorio, cambios rápidos de ficha, refresco de versión, teclado/móvil y nuevo perfil comparable con las cabeceras de tiempos. No se guardó una captura verificable de la mejora ni se obtuvo todavía una nueva cifra de INP/FPS.

## Verificación visual retomada

Se confirmó en Brave la apertura del mismo evento y el cierre con Escape, que devuelve el foco al botón Revisar. Para que el estado transitorio pudiera observarse se creó un perfil temporal de 10.000 ms de latencia y 10 Mbit/s: antes del JSON aparecieron título, fecha/hora localizadas, lugar, descripción y «Abriendo ficha…», sin Editar ni Consultar estado. Después llegó el panel completo y sus controles. Se tomaron observaciones de pantalla durante la prueba, sin guardar una imagen como archivo del repositorio.

En una solicitud anterior de esta sesión, con simulación 3G, las cabeceras reales mostraron:

| Fase | Duración |
| --- | ---: |
| Acceso y permisos de la ruta | 317,25 ms |
| Lectura de la ficha | 0,67 ms |
| Preparación | 0,07 ms |
| Serialización | 0,17 ms |
| Total de la ruta | 318,16 ms |
| Proxy, separado del total de ruta | 10,22 ms |

En esta muestra el coste de la ruta se concentra en acceso/permisos, no en la lectura de la ficha. Todavía no distingue requireAccount, acceso local del equipo y auth de Clerk; tampoco atribuye la demora de entrada de la traza anterior. La simulación de red impide tratar el tiempo de respuesta completo de esta prueba como una comparación directa con los 353 ms iniciales.

Se abrió además la ficha en emulación de 390×844 a escala reducida; no se considera una auditoría móvil completa. Pendientes: cambio rápido entre fichas distintas, refresco de versión, teclado completo y perfil comparable de cuadros/INP en producción. Al terminar se eliminó el perfil creado, se dejó No throttling, se retiró la emulación y se cerró DevTools. La bandeja quedó visible con su filtro previo. No se reinició el servidor ni se editaron eventos.

## Segunda mejora y nueva medición

Se eliminaron construcciones repetidas de Intl por fila/render, se separó el texto urgente del buscador del listado actualizado con useTransition y se añadió anticipación local de una ficha al enfocar/pasar por Revisar o su título. Esa lectura está ligada al listado actual, caduca a los tres segundos y se consume una sola vez; una reapertura sin nueva anticipación vuelve a consultar. No evita controles de acceso ni de versión.

Las solicitudes simultáneas de perfil comparten sólo trabajo en curso por identidad verificada; ni resultados ni errores terminados se almacenan. Se mantienen consulta a Clerk, verificación de correo, bloqueo y lectura local de permisos para cada operación. La latencia de una petición individual al servicio remoto sigue existiendo. Las nuevas fases session/profile/identity permiten medirla sin confundirla con SQLite o vinculación.

Una traza intermedia de Inicio → Eventos → búsqueda → ficha dio INP 621 ms (5 ms de input delay, 595 ms de procesamiento, 21 ms de presentación). Motivó separar la escritura de la bandeja; no identifica por sí sola una función culpable ni demuestra una regresión frente a los 202 ms iniciales. Otra captura se interrumpió con el buscador vacío y se excluye como prueba de búsqueda.

La traza final, tras la separación del buscador, registró teclas reales g/a/r/m/i/n: se comprobó el valor «garmin», una coincidencia, apertura del evento y cierre con Escape. No hubo navegación desde Inicio dentro de esta última captura. Brave/servidor de desarrollo, sin limitación de red o CPU, DevTools abierto y varias pestañas existentes:

| Medida de la traza final | Resultado |
| --- | ---: |
| INP | 61 ms |
| Input delay | 1 ms |
| Processing duration | 39 ms |
| Presentation delay | 22 ms |
| CLS | 0 |

DevTools redondea los subintervalos. Esta muestra es favorable para interacción, pero no es un p95 ni una comparación controlada de navegación fría. No se obtuvo distribución fiable de cuadros activos/FPS, ni una nueva medida de latencia remota por fase después de la modificación de auth. No usar estos 61 ms como tiempo de respuesta del JSON ni afirmar que se eliminaron los 317 ms remotos.

Validación de la versión final: npm run check (lint, tipos, 233 pruebas), build aislado y 9 integraciones correctos. Se conservan las regresiones de rechazo por identidad/correo y disponibilidad, y se añaden pruebas de trabajo concurrente y anticipación. Se cerró DevTools y se dejó la bandeja con el resultado de la búsqueda. No se reinició el servidor ni se modificaron eventos.

## Comprobación posterior en producción aislada

Se sirvió la compilación existente de `work/verify-performance/.next-verificar` con 100 eventos ficticios y autenticación del fixture local de pruebas. Datos, proxy de prueba y servidor quedaron en loopback; no se copiaron datos reales ni se sustituyeron cookies de la sesión del propietario. Se usó el navegador integrado en segundo plano, independiente de las pestañas de Brave. Los eventos ficticios no tienen imágenes: no cubre decodificación de medios, mapa ni perfiles sociales.

El contador existe sólo en el arnés: registra intervalos de requestAnimationFrame, Event Timing y longtask. Se comprobaron inicio efectivo de captura, búsqueda escrita por teclas, coincidencia, apertura con detalle completo y Escape. Un intento inicial sin muestras y uno móvil sin contador activo se descartaron. No se suman como pruebas aprobadas.

| Recorrido | Intervalo rAF p95 | Máximo rAF | Máximo Event Timing | Tareas >50 ms |
| --- | ---: | ---: | ---: | ---: |
| Escritorio 1280×720, primera pasada | 34,2 ms | 34,4 ms | 56 ms | 0 |
| Escritorio 1280×720, segunda pasada | 34,2 ms | 34,4 ms | 56 ms | 0 |
| Móvil 390×844 | 34,6 ms | 35,2 ms | 56 ms | 0 |
| Reposo, contador corregido | 34,7 ms | 35,3 ms | Sin interacciones | 0 |

La cadencia rAF del entorno fue aproximadamente 30 Hz tanto en reposo como durante las acciones. No hay picos adicionales relevantes en estos recorridos, pero rAF no cuenta cuadros presentados por la GPU: no demuestra 60/120 FPS en Brave. Los intervalos incluyen pausas de orquestación; por eso se conserva también el máximo y se revisan tareas largas, en lugar de usar sólo el promedio. El máximo de Event Timing es por ventana de medición, no el INP de toda la sesión. Las primeras dos pasadas incluyen además el botón del contador (máximo conservador); móvil y reposo final lo excluyen.

En móvil se verificaron ancho de página, viewport y diálogo: 390 px cada uno. La ficha cambió correctamente entre eventos distintos en las pasadas y Escape cerró. Los scripts de prueba nunca pulsaron Aprobar, Editar ni Publicar. Al terminar se restauró el viewport, se cerró la pestaña temporal y se detuvieron ambos servidores del arnés; el servidor habitual no se reinició.

### Consulta real de perfil en Clerk

Una comprobación separada, de sólo lectura y con la configuración existente, solicitó cinco veces el perfil del propietario. No se guardaron ID, correo, respuesta ni credenciales. La primera llamada tardó 6.293,91 ms; las cuatro siguientes, 184,49 / 176,14 / 178,40 / 167,38 ms (mediana caliente 177,27 ms). Se reutilizó cliente/conexión en un proceso. No se separó DNS/TLS de procesamiento remoto, por lo que no se atribuyen los 6,29 s a una fase concreta.

El fixture local respondió al listado en una mediana de 9,27 ms (12 solicitudes), con la última consulta del perfil ficticio en 2,19 ms. Esto confirma que las condiciones del proveedor alteran la espera; no permite equiparar esos 9 ms con la instalación real. La petición individual a Clerk sigue existiendo. Eliminarla con una caché de perfiles introduciría una ventana de acceso con datos de bloqueo/verificación antiguos; no se hizo ese cambio.

Resultados resumidos: `docs/performance-browser-2026-11-27.json`. Herramientas reproducibles, fuera del flujo del producto:

- `node --import tsx scripts/performance-browser-fixture.mts`: requiere primero el build aislado; imprime la URL temporal. Ctrl+C detiene el arnés.
- `node --env-file-if-exists=.env.local --import tsx scripts/measure-clerk-profile.mts`: cinco lecturas del perfil propio; sólo imprime duraciones y éxito.

Esta validación no introduce una nueva optimización funcional. Completa la medición de los recorridos probados y documenta el límite de la consulta remota. Quedan fuera una auditoría de todas las secciones y FPS de producción en el navegador nativo con medios reales.
