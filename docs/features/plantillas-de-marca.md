# Plantillas de marca con datos verificados (función 1 del foro de HighLevel)

Estado: **especificación preparada, sin implementar**. Fecha: 7 de octubre de 2026. Bloqueada por las decisiones de la sección «Decisiones pendientes».

## Objetivo

Que cada empresa (Sgmotos, motoxspress, otros negocios) cree contenido a partir de una plantilla propia que combine su logo, sus colores y su voz con datos **verificados** del catálogo, sin escribir cada publicación desde cero y sin perder el flujo de revisión y aprobación.

## Lo que ya existe (no se reemplaza)

| Pieza                                                                       | Dónde                                                   | Uso en esta función                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Colores principal/acento y logo por negocio (`workspace.appearance`)        | Ajustes › Apariencia del panel, `src/lib/model.ts`      | Fuente de los colores y el logo de la plantilla. Desde la migración ya no cambian el panel: hoy no tienen ningún efecto visible.  |
| Perfil de marca: voz, público, temas permitidos/excluidos, reglas           | Marca y criterios (`brandSchema`)                       | Tono y límites del texto de la plantilla.                                                                                         |
| Catálogo con `verified`, `verifiedOn`, `sourceUrl`, variantes y promociones | Catálogo (`catalogProductSchema`, `src/lib/catalog.ts`) | Únicos datos que una plantilla puede insertar.                                                                                    |
| Borradores desde catálogo (`createCatalogPosts`) y asistente de 4 pasos     | `campaign-wizard.tsx`, `catalog.ts`                     | La plantilla sería un paso más del asistente, no un flujo paralelo.                                                               |
| Revisión/aprobación con comprobaciones de hechos, derechos y marca          | Publicaciones                                           | Todo lo que genere una plantilla nace como borrador y pasa por revisión. Editar una plantilla no toca publicaciones ya aprobadas. |

## Propuesta — fase local (sin GHL)

1. **Modelo** (por negocio, dentro de su workspace, validado con Zod): `contentTemplates[]` con `id`, `name`, `channels` (instagram/facebook/whatsapp, igual que hoy), `textPattern` con marcadores cerrados (`{producto}`, `{variante}`, `{precio}`, `{promocion}`, `{vigencia}`, `{financiamiento}`, `{marca}`), `layout` (si hay imagen: «ficha de producto» o «promoción»), `useLogo`, `useBrandColors`, `createdAt/updatedAt`.
2. **Reglas de datos verificados:** un marcador solo se rellena con un campo del producto/variante verificado (`verified` y `verifiedOn` no futuro), y una promoción solo si está vigente. Si falta un dato, la plantilla no inventa: el borrador queda marcado con el campo pendiente y no se puede aprobar hasta completarlo. Se guarda `catalogRevision` como hoy.
3. **Uso:** en el asistente «Crear desde el catálogo» se elige plantilla → se generan borradores por red → revisión normal. Sin publicación ni envío automático.
4. **Edición de plantillas:** pantalla nueva dentro de «Marca y criterios», con vista previa usando los colores/logo del negocio.
5. **Aislamiento:** las plantillas viven en el workspace de cada negocio; la API existente (`requestBusinessId`) ya impide leer o escribir las de otra empresa. Pruebas de integración: Sgmotos no ve ni usa plantillas de motoxspress.
6. **Exportación/respaldo:** incluir plantillas en el ZIP del negocio.

Criterios de aceptación: plantillas persisten tras reiniciar; un marcador sin dato verificado bloquea la aprobación; promoción vencida no se inserta; editar plantilla no modifica aprobados; aislamiento probado por HTTP; ES-SV; móvil 390 px sin desbordamiento; check/build/integración en verde.

## Fase posterior — GHL (no implementar todavía)

Documentación pública encontrada: «Design Kits API – Brand Boards API v3» (help.gohighlevel.com, artículo 155000008331). Describe, con base `/brand-boards/locations/:locationId/design-kits`: listar, crear, leer, actualizar (PATCH), borrar y marcar como predeterminado (`POST …/:designKitId/default`). Guarda colores, fuentes y otros elementos visuales. OAuth 2.0 con Bearer.

**Sin confirmar** (verificar en la cuenta antes de cualquier código): nombres exactos de los scopes, si requiere token de ubicación o de agencia / integración privada, disponibilidad según plan, límites de uso y esquema de campos. Tampoco se sabe si los logos de Brand Boards son accesibles por esta API. Comprobación propuesta, en solo lectura: el propietario crea una integración privada de prueba con el scope de lectura que GHL muestre para Brand Boards, y se hace un único `GET` de design kits de una ubicación de prueba. Sin escritura ni datos reales de clientes hasta decidir la dirección de sincronización (ezrá → GHL, GHL → ezrá o ninguna).

## Decisiones pendientes del propietario

1. **¿Solo texto o también imagen?** Generar una imagen con logo y colores (tarjeta de producto/promoción) requiere un motor de composición local (SVG/Canvas → PNG) y fotos propias del producto. Solo texto es más rápido de entregar.
2. **Colores de Apariencia:** propuesta: que se usen en las plantillas e imágenes, y que la tarjeta de Ajustes lo diga (hoy parecen no hacer nada).
3. **Quién edita plantillas:** solo administración, o también cada cliente en su panel.
4. **Marcadores permitidos:** confirmar si precio, cuota/financiamiento y vigencia de promoción pueden publicarse tal cual vienen del catálogo verificado.
5. **Sincronización con GHL:** ninguna por ahora, solo lectura de Brand Boards, o exportar el kit de ezrá a GHL.
