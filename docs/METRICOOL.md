# Metricool · evaluación para Spotmi

Actualizado: 4 de octubre de 2026. Fuentes: ayuda oficial de Metricool (enlaces al final) y capturas de la cuenta compartidas por el propietario. El MCP de Metricool se añadió a Claude Code para evaluarlo; la autorización no llegó a la sesión y se retiró a petición del propietario. La cuenta se verificó con capturas, no por MCP.

## Cuenta de Spotmi (verificada con capturas)

| Dato             | Valor                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| Plan             | **Free**, sin fecha de fin. No hay prueba activa ni cobro automático pendiente.     |
| Marcas           | 1 de 1: `spotmi.sv`                                                                 |
| Redes vinculadas | Facebook e Instagram                                                                |
| Sin conectar     | TikTok y YouTube (disponibles en Free); LinkedIn (requiere plan de pago); X: 0 de 0 |
| Límites          | 20 publicaciones al mes, métricas de 30 días con marca de agua                      |

## Decisión

Evaluar Metricool como herramienta de **programación manual y métricas** para Spotmi, sin integrarla en código. ezrá sigue siendo la fuente de verdad editorial: allí se prepara, revisa y aprueba cada versión. Metricool se usa a mano para programar la versión aprobada y para consultar métricas.

## Qué dice la ayuda oficial

| Tema                   | Dato verificado                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API de Metricool       | Solo en planes **Advanced** y **Custom**. Es la vía que usan n8n, Make, Zapier o Postman.                                                                                                                                                                                                                                              |
| MCP de Metricool       | Funciona en **todos los planes, incluido Free**. Conectar el MCP no amplía los límites del plan.                                                                                                                                                                                                                                       |
| Qué puede hacer el MCP | Leer marcas, métricas e informes, y también **escribir**: crear y editar publicaciones programadas, publicar, responder comentarios y mensajes. No gestiona campañas de anuncios. Metricool advierte que da un acceso «similar a iniciar sesión directamente».                                                                         |
| Plan Free              | 1 marca, un perfil por red y marca, hasta **20 publicaciones al mes** en el planificador, **30 días** de métricas, analítica con marca de agua. Sin LinkedIn ni X. Sin informes PDF/PPT, Canva, Drive, Looker Studio, Make ni Zapier.                                                                                                  |
| Starter                | 5 o 10 marcas, publicación sin tope mensual (uso razonable), historial completo de métricas, informes PDF/PPT, Canva y Drive. **Sin API.**                                                                                                                                                                                             |
| Advanced               | Todo Starter + equipo y clientes, roles, **aprobación de publicaciones**, plantillas de informes, Looker Studio y **API**.                                                                                                                                                                                                             |
| Prueba con código      | Pide tarjeta o PayPal para activarse. **Si no se cancela antes de que termine, cobra automáticamente** el plan y ciclo elegidos. Al cancelar o terminar, la cuenta vuelve a Free y **no se borra nada** (publicaciones programadas, métricas, marcas). Las publicaciones del mes en plan de pago cuentan para el límite de 20 de Free. |
| Precios                | No figuran en la ayuda; están en la página de precios. No se consultaron.                                                                                                                                                                                                                                                              |

## Qué se puede hacer con USD 0

- Programar **a mano** en Metricool, plan Free, la versión aprobada en ezrá: hasta 20 publicaciones al mes en la marca `spotmi.sv`, que ya tiene Instagram y Facebook vinculados.
- Consultar las métricas de los últimos 30 días en Metricool.
- Usar el MCP desde Claude Code **solo para consultar** (plan, marcas, redes, métricas). Cada escritura requiere el sí explícito del propietario, una por una.

## Qué exige Advanced (fuera del presupuesto actual)

- La **API**, que es lo único que permitiría a n8n o a ezrá hablar con Metricool de forma automática.
- La aprobación de publicaciones dentro de Metricool. No hace falta: la aprobación vive en ezrá.

Por eso **n8n no se conecta con Metricool** en este piloto. El contrato de automatización de ezrá ya admite un proveedor intercambiable (`mode` simulation/live, `action`), así que Metricool API o Meta podrían añadirse después sin reescribir la base.

## Qué se perdería al bajar de un plan de pago

La cuenta ya está en Free, así que hoy no se pierde nada. Si en el futuro se activa una prueba o un plan de pago y luego se vuelve a Free: dejan de estar disponibles más de una marca, la publicación sin tope, el historial de más de 30 días, los informes y la API. Los datos no se borran, y las publicaciones de ese mes cuentan para el límite de 20. **No se diseña nada en ezrá que dependa de funciones de pago.**

**Riesgo de gasto:** las pruebas con código piden tarjeta o PayPal y cobran automáticamente si no se cancelan. No activar ninguna sin una decisión explícita del propietario y una fecha de cancelación anotada.

## Flujo manual recomendado (ezrá → Metricool → ezrá)

1. En ezrá: aprobar la versión y guardar la fecha prevista.
2. En ezrá: **Exportar versión guardada** de la publicación (ZIP con `publicacion.txt` y los medios).
3. En Metricool: crear la publicación en la red indicada, pegar el texto, subir los medios y programarla para la fecha prevista.
4. Cuando se publique: copiar el enlace real (instagram.com o facebook.com) y pulsar **Registrar publicación manual** en ezrá.

### ¿Basta la exportación actual?

Sí para hacerlo a mano: incluye texto, red, formato, fecha prevista en hora de El Salvador, fuentes y archivos originales, y el registro del enlace ya acepta direcciones https de Instagram y Facebook. Mejoras propuestas, **no implementadas** y pendientes de aprobación:

- **`texto.txt` solo con el texto final**, para copiar y pegar sin arrastrar los datos internos de `publicacion.txt`.
- **Aviso de formato:** Instagram por API solo acepta JPEG. Si Metricool lo exige o convierte por su cuenta está **sin verificar**; ezrá acepta PNG y WebP.
- **Aviso si el paquete no está aprobado:** hoy se puede descargar el paquete de un borrador. Proponer una advertencia visible en `publicacion.txt` cuando la versión no esté aprobada.

## Fuentes

- [MCP vs API access](https://help.metricool.com/mcp-vs-api-access-what-is-the-difference-5y3ib)
- [MCP limits and plan requirements](https://help.metricool.com/mcp-limits-and-plan-requirements-h72jg)
- [How to connect Metricool's MCP with Claude](https://help.metricool.com/how-to-connect-metricools-mcp-with-claude-0l84v)
- [How to connect Metricool's MCP](https://help.metricool.com/how-to-connect-metricools-mcp-eqp9h)
- [Plans, add-ons, and API access explained](https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u)
- [How to redeem a promotional code](https://help.metricool.com/en/article/how-to-redeem-a-promotional-code-in-metricool-p52uwa/)
- [Main differences between Free and paid plans](https://help.metricool.com/en/article/main-differences-between-free-and-premium-plans-1udj06m/)
