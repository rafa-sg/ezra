# Guion del video de demostración · Ezra y la API de YouTube

Lo grabas tú. Ezra no sube nada a YouTube por su cuenta: la única subida del video es la que autorizas tú en el paso 6.
El formulario exige un recorrido completo en video cuando no hay cuenta de prueba (Ezra no la tiene porque solo funciona en tu Mac), así que el video reemplaza a la «demo account».

## Antes de grabar

- [ ] La página `https://spotmi.com.sv/es/ezra` y la sección de privacidad ya publicadas (rama `feat/ezra-youtube-api` de spotmi-web, después de que la revises y la subas).
- [ ] `npm run dev` en la carpeta de Ezra y la app abierta en `http://127.0.0.1:3000/azra/produccion`.
- [ ] Un video **propio** de prueba en MP4, corto (10–30 s), por ejemplo `prueba-auditoria.mp4`. Nada de material de terceros.
- [ ] Un encargo «Videos virales» de prueba puede crearse en vivo (paso 5); no hace falta tenerlo antes.
- [ ] Graba la **ventana completa del navegador** con la barra de direcciones visible (QuickTime › Nueva grabación de pantalla, o ⌘⇧5 › Grabar parte seleccionada con la ventana entera). 1080p o más.
- [ ] Cierra pestañas con datos personales y oculta notificaciones (modo «No molestar»). No muestres `.env.local`, la Terminal ni tokens.
- [ ] Idioma: puedes dejar Ezra en español; al subir el video al formulario, explica en el campo de texto que la interfaz está en español (o activa EN en el menú de idioma si prefieres).

## Recorrido (≈ 6–8 minutos)

### 1. Qué es y dónde están las políticas (30 s)
1. Abre `https://spotmi.com.sv/es/ezra`. Muestra la barra de direcciones y desplázate despacio por la página.
2. Haz clic en el enlace a privacidad: llega a `https://spotmi.com.sv/es/privacidad#ezra-youtube`. Desplázate por toda la sección «Ezra y servicios de la API de YouTube» (permisos, datos, 30 días, revocación, contacto).
3. Abre `https://spotmi.com.sv/es/terminos#ezra-youtube` y muestra el párrafo de los Términos de servicio de YouTube.
4. Vuelve al inicio `https://spotmi.com.sv/es` y baja al pie: se ve el enlace «Privacidad».

### 2. Ezra corre solo en tu Mac (15 s)
5. Cambia a la pestaña `http://127.0.0.1:3000/azra/produccion`. Detente un segundo en la barra de direcciones (127.0.0.1 = solo esta computadora).

### 3. Conectar YouTube con OAuth (1 min)
6. Menú lateral › **Conexiones** › tarjeta **YouTube**. Si ya está conectado, pulsa **Desconectar** (así se ve también la revocación) y espera el aviso.
7. Pulsa **Conectar**. Se abre `accounts.google.com`: elige la cuenta que administra el canal Spotmi (@spotmisv).
8. En la pantalla de permisos de Google, **detente** para que se lean los permisos (ver y subir videos de YouTube). Acepta.
9. Vuelves a `127.0.0.1:3000`: la tarjeta muestra el canal Spotmi conectado y el aviso de que los videos se suben en privado.

### 4. Ver las métricas del canal (1 min)
10. Menú lateral › **Apps** › YouTube (canal Spotmi).
11. Si aparece «Autorizá YouTube Analytics…», pulsa **Autorizar métricas**: Google pide además el permiso de YouTube Analytics (solo lectura). Acepta y vuelve.
12. Muestra los totales del canal, los videos recientes y las gráficas de 7/28/90 días (vistas, horas, suscriptores). Di o escribe en pantalla: «solo el canal propio; se guarda en memoria 15 minutos».

### 5. Encargo «Videos virales» (1–1,5 min)
13. Menú lateral › **Nuevo encargo** › **Videos virales**. Tema: por ejemplo `pupusas El Salvador`; período: «Los últimos 30 días». **Crear encargo**.
14. En el encargo, marca la confirmación «Confirmo buscar en YouTube con la cuenta conectada.» y pulsa **Ejecutar**.
15. Muestra la lista: enlaces, métricas públicas, el aviso de derechos y la línea «Consulta a YouTube: … Por las políticas de la API de YouTube, estos datos se borran el …».
16. Haz clic en un título: se abre el video en YouTube (Ezra no lo descarga).
17. Revisión: pulsa **Aprobar** (o pide cambios) para mostrar que una persona revisa el resultado.

### 6. Subir un video propio en privado (2–3 min)
18. Menú lateral › **Granjas** › **Granja vacía**. Nombre: `Video propio a YouTube`.
19. **Agregar paso** › **Medios**. En el inspector, sube `prueba-auditoria.mp4` y escribe en el permiso: «Video propio de Spotmi». Márcalo.
20. **Agregar paso** › **Agente** › especialidad **Descripción**, proveedor **Trabajo manual** (sin IA).
21. **Agregar paso** › **Tu revisión**, y **Agregar paso** › **Publicación** con destino **YouTube** solamente.
22. Conecta: Medios → Tu revisión; Descripción → Tu revisión; Tu revisión → Publicación. **Guardar**.
23. **Ejecutar granja**. En el paso Descripción pega un texto (título y descripción del video) y pulsa **Guardar resultado manual**.
24. En **Tu revisión** marca hechos, derechos y marca, y pulsa **Aprobar revisión**.
25. Baja a la **Vista previa**: muestra la huella de la versión. Marca las tres comprobaciones y pulsa **Aprobar versión** («esta versión está aprobada»).
26. En **Cuentas de destino** marca YouTube, pulsa **Simular envío** y muestra el plan: `videos.insert … privado`.
27. Escribe `PUBLICAR` y pulsa **Autorizar publicación**. Espera a que el recibo diga «procesando» o «borrador subido» y muestre el enlace a YouTube Studio.

### 7. El video en YouTube Studio (45 s)
28. Abre el enlace del recibo (`https://studio.youtube.com/video/…/edit`). Muestra la barra de direcciones y que la visibilidad es **Privado**.
29. Explica (o muestra) que publicarlo se haría a mano desde aquí. No hace falta publicarlo; puedes borrarlo después de grabar.

### 8. Desconectar y revocar (45 s)
30. Vuelve a Ezra › **Conexiones** › YouTube › **Desconectar**. La tarjeta queda sin cuenta.
31. Abre `https://security.google.com/settings/security/permissions` (redirige a la página de conexiones de tu cuenta de Google) y muestra que el acceso de la app ya no aparece, o cómo quitarlo desde allí.
32. Fin.

## Después de grabar
- Revisa que no se vean correos personales, tokens ni pestañas ajenas. Recorta lo que sobre.
- Sube el video como **no listado** a YouTube (o a Google Drive con «cualquiera con el enlace») y pega el enlace en el formulario (sección 6, materiales de apoyo).
- Si borraste el video de prueba en YouTube Studio, el recibo de Ezra lo dirá al consultarlo («YouTube ya no encuentra el video»).
- Vuelve a conectar YouTube en Ezra si lo necesitas para trabajar.
