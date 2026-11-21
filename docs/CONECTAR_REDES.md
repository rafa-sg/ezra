# Conectar Instagram, Facebook, TikTok y YouTube a Ezra

Guía paso a paso para el propietario. Todo se hace en **esta Mac**, con Ezra abierto en
**http://127.0.0.1:3000** (no uses `localhost`: la sesión de la conexión se ata a esa dirección).

**Lo que Ezra hace y no hace con tus redes**

- Conectar una cuenta solo permite **leerla y preparar envíos**. Ezra nunca publica por su cuenta:
  cada envío exige una versión aprobada y que escribas `PUBLICAR` para esa cuenta.
- TikTok y YouTube reciben **borradores**: TikTok los deja en tu bandeja de la app y YouTube los sube
  en **privado**. Los terminas y publicas tú en sus apps.
- Los tokens se guardan **cifrados** en `data/` con `EZRA_TOKEN_KEY`. No cambies esa clave: los tokens
  guardados dejarían de poder leerse.
- Las claves de cada red van en archivos privados de esta carpeta (`.env.meta.local` o `.env.local`),
  **nunca en el chat**. Después de editarlos, reinicia Ezra (Ctrl+C en la Terminal y `npm run dev`).

## Estado al 21 de noviembre de 2026

| Red | Estado | Lo que falta |
| --- | --- | --- |
| Instagram (@spotmi.sv) | **Conectada para publicar** | Nada. El acceso vence el **29 de diciembre**: entre el 22 y el 28, entra a Conexiones y pulsa «Verificar» (Ezra lo renueva por 60 días más). |
| Facebook (Página de Spotmi) | Sin configurar | El ID y el secreto de la app de Meta (`META_APP_ID`, `META_APP_SECRET`). |
| TikTok | Sin configurar | Una app de TikTok y el puente https de n8n. |
| YouTube | Sin configurar (nuevo) | Un cliente OAuth de Google (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`). |

En Ezra, **Conexiones → Cuentas para publicar → «Ver guía»** muestra para cada red qué variable falta
y la dirección de regreso exacta que debes registrar.

---

## 1. Facebook (Página de Spotmi) · unos 15 minutos

Usa la **misma app de Meta** que ya tiene Instagram.

1. Entra a https://developers.facebook.com/apps y abre tu app.
2. **Casos de uso → Agregar** → «Administrar todo en tu Página» (inicio de sesión con Facebook para
   empresas). Agrega los permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
   `instagram_basic` e `instagram_manage_insights`.
3. En la configuración del inicio de sesión con Facebook, en **URI de redireccionamiento de OAuth
   válidos**, agrega: `https://spotmi.app.n8n.cloud/webhook/ezra-oauth-facebook`
4. **Configuración de la app → Básica**: copia el **Identificador de la app** y la **Clave secreta**.
5. Abre `.env.meta.local` (está en la carpeta de Ezra) y completa:
   ```
   META_APP_ID=el identificador
   META_APP_SECRET=la clave secreta
   ```
   (`META_REDIRECT_URI` ya está configurada.)
6. Reinicia Ezra, entra a Conexiones → Facebook → **Conectar**, elige la Página de Spotmi y acepta.
7. Pulsa **Verificar**: la tarjeta debe decir la Página y «Conectada para publicar».

Mientras la app de Meta esté en modo desarrollo, solo funciona con cuentas que tengan un rol en la app
(la tuya ya lo tiene). Leer páginas de otros requiere revisión de Meta (ver «Ver guía» en Facebook).

## 2. TikTok · unos 30 minutos más la revisión de TikTok

TikTok **no permite publicar directamente** desde herramientas internas: Ezra sube el video como
**borrador** a tu bandeja y tú lo terminas en la app (privacidad, música, divulgación).

1. Crea una cuenta en https://developers.tiktok.com y una app (**Manage apps → Connect an app**).
2. Agrega los productos **Login Kit** y **Content Posting API** (solo «Upload», no «Direct Post»).
   Permisos: `user.info.basic` y `video.upload`.
3. TikTok exige una dirección de regreso **https**. Ezra usa el mismo puente de n8n que Meta:
   1. En n8n (https://spotmi.app.n8n.cloud) abre el flujo «Ezra — Meta y conexión» y agrega los tres
      nodos «Regreso tiktok», «Validar regreso tiktok» y «Volver a Ezra tiktok». Están en
      `docs/n8n/ezra-meta.json` de este repositorio: puedes importar el archivo completo o copiar solo
      esos nodos. Guarda y **publica** el flujo.
   2. En TikTok, registra como Redirect URI: `https://spotmi.app.n8n.cloud/webhook/ezra-oauth-tiktok`
4. Copia el **Client key** y el **Client secret** y agrégalos a `.env.meta.local`:
   ```
   TIKTOK_CLIENT_KEY=el client key
   TIKTOK_CLIENT_SECRET=el client secret
   TIKTOK_REDIRECT_URI=https://spotmi.app.n8n.cloud/webhook/ezra-oauth-tiktok
   ```
5. Mientras la app no esté aprobada, TikTok solo deja entrar a las cuentas agregadas como
   **usuarios de prueba** (Sandbox): agrega la cuenta de Spotmi ahí.
6. Reinicia Ezra → Conexiones → TikTok → **Conectar** → **Verificar**. La tarjeta debe decir
   «Restringida: subir borradores».

## 3. YouTube · unos 20 minutos

Google acepta `http://127.0.0.1` como dirección de regreso: **no hace falta n8n**.

1. Entra a https://console.cloud.google.com y crea un proyecto (por ejemplo «Ezra Spotmi»).
2. **APIs y servicios → Biblioteca** → busca **YouTube Data API v3** → **Habilitar**.
3. **Pantalla de consentimiento de OAuth** (o «Google Auth Platform»): tipo **Externo**, nombre «Ezra»,
   tu correo de soporte. En **Público / Usuarios de prueba**, agrega la cuenta de Google que administra
   el canal de Spotmi. Deja la app en modo **Prueba**.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
   En **URI de redireccionamiento autorizados** agrega exactamente:
   `http://127.0.0.1:3000/conexiones/youtube/callback`
5. Copia el **ID de cliente** y el **Secreto del cliente** en `.env.local`:
   ```
   YOUTUBE_CLIENT_ID=el id de cliente
   YOUTUBE_CLIENT_SECRET=el secreto
   ```
6. Reinicia Ezra → Conexiones → YouTube → **Conectar**. Google mostrará «Google no verificó esta app»
   (es tu propia app en prueba): **Continuar** y acepta los permisos de ver y subir videos.
7. Pulsa **Verificar**: debe decir el nombre del canal y «Restringida: subir borradores».

Ezra sube con el **título de la pieza** y, como descripción, el texto de Instagram (o el de Facebook),
siempre en **privado**. Mientras el proyecto de Google no pase la auditoría de YouTube, Google también
deja privados los videos subidos por API. La cuota gratuita de Google alcanza para unas 6 subidas al día.

## 4. Instagram · ya conectada

- Para revisar: Conexiones → Instagram → **Verificar**.
- Entre el **22 y el 28 de diciembre** pulsa **Verificar**: Ezra renueva el acceso por 60 días (solo lo hace en la última semana). Si ya venció, pulsa **Reconectar**.

---

## Si algo falla

| Lo que ves | Qué hacer |
| --- | --- |
| La tarjeta dice «Sin configurar» después de editar el archivo | Reinicia Ezra: los archivos `.env*` solo se leen al arrancar. Revisa que no haya espacios alrededor del `=`. |
| «La respuesta de autorización no coincide con una solicitud vigente» | Iniciaste la conexión desde `localhost` o tardaste más de 10 minutos. Vuelve a pulsar «Conectar» desde http://127.0.0.1:3000. |
| «La dirección de retorno … no coincide con el puente OAuth de n8n» | La variable `…_REDIRECT_URI` tiene un error de copia: debe ser exactamente la de esta guía. |
| Meta o TikTok dicen que la dirección de regreso no es válida | Registra la dirección https de n8n de esta guía en la app de la red, sin barra al final. |
| Google dice «redirect_uri_mismatch» | Registra exactamente `http://127.0.0.1:3000/conexiones/youtube/callback` en el ID de cliente. |
| Google dice «access_denied» | Agrega tu cuenta de Google como **usuario de prueba** en la pantalla de consentimiento. |
| YouTube: «Esta cuenta de Google no tiene un canal» | Entra con la cuenta que administra el canal de Spotmi (o crea el canal). |
