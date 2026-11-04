# Ezra → n8n → Meta

## Estado

El transporte de Granjas y la tarjeta Conexiones están implementados. Las pruebas locales sustituyen a n8n/Meta. La prueba real anterior solo confirmó el webhook de prueba. Importar el flujo nuevo, publicarlo, configurar Meta y autorizar cuentas son pasos pendientes; no hay publicación real comprobada.

## n8n

1. Descarga `ezra-meta.json` desde Conexiones o usa `docs/n8n/ezra-meta.json`.
2. Desactiva el flujo de prueba antes de activar este: ambos usan POST /ezra-publicaciones. Conserva el anterior por si necesitas volver atrás.
3. Importa el archivo como workflow y selecciona la credencial Header Auth existente en «Recibir solicitud de Ezra». Name: X-Ezra-Secret, Value: la clave privada que ya tienes.
4. Publica el workflow. No habilites guardado de ejecuciones ni fijes datos reales: el contenido, los medios y los tokens temporales de Meta pasan por sus nodos. El archivo deshabilita persistencia de ejecuciones, incluso las fallidas.
5. En `.env.n8n.local`, usa `EZRA_N8N_WEBHOOK_URL=https://spotmi.app.n8n.cloud/webhook/ezra-publicaciones`. Desde Conexiones en Ezra pulsa Probar conexión. El estado vuelve a «sin comprobar» al reiniciar el proceso.
6. Tras comprobar la importación y las cuentas, añade `EZRA_N8N_PUBLICACION=1`. Sin esta opción los adaptadores directos conservan su comportamiento anterior. No hay envío por aprobar el contenido o conectar una cuenta: exige la autorización existente con PUBLICAR para cada versión/destino.

## Meta

Esta implementación conserva los dos adaptadores de Ezra: Instagram Login (instagram_business_basic, instagram_business_content_publish) y Facebook Pages (pages_show_list, pages_read_engagement, pages_manage_posts). No mezclar los scopes de Instagram Login con los de Facebook Login. Un App ID de Instagram puede ser diferente del ID general de Meta.

Configura en `.env.meta.local` (archivo privado ignorado por Git; se carga al iniciar el servidor):

```
META_APP_ID=
META_APP_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
META_REDIRECT_URI=https://spotmi.app.n8n.cloud/webhook/ezra-oauth-facebook
INSTAGRAM_REDIRECT_URI=https://spotmi.app.n8n.cloud/webhook/ezra-oauth-instagram
```

`EZRA_TOKEN_KEY` (32 bytes base64) debe estar configurada en el servidor para cifrar tokens. No cambies una clave existente: los tokens anteriores dejarían de poder descifrarse. Para una instalación sin clave, genera una con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` y guárdala de forma privada.

Registra las dos direcciones de retorno anteriores en la configuración de inicio de sesión correspondiente en Meta. El workflow incluye dos webhooks GET que devuelven el navegador al callback fijo de Ezra en `http://127.0.0.1:3000`. No expone el servidor local. No guarda códigos de autorización ni permite elegir otro destino. El callback de Ezra sigue exigiendo sesión de administración y el state de un solo uso ligado a esa sesión. Usa Ezra en 127.0.0.1:3000 para iniciar y completar el proceso; entrar por localhost usaría otro origen/sesión.

Reinicia el servidor después de guardar `.env.meta.local`. Abre Conexiones, conecta Facebook, elige la Página y comprueba el permiso CREATE_CONTENT; conecta Instagram profesional y verifica su identidad y publicación. Meta puede exigir roles de pruebas, acceso avanzado, revisión y verificación del negocio según las cuentas que conectes. Las claves se completan en privado, nunca en el chat ni en el JSON del flujo.

## Envíos y resultados

Solo publicar/confirmar de Facebook e Instagram pasan por el transporte n8n cuando está habilitado. OAuth y verificación de cuentas siguen directamente en Ezra; TikTok y Spotmi no cambian. El trabajador valida de nuevo aprobación por huella, autorización vigente y cuenta elegida antes de enviar. Los adaptadores interpretan el resultado real de Meta y lo guardan en los recibos existentes. Un resultado ambiguo se concilia, nunca se reenvía automáticamente.

n8n no necesita llamar a tu Mac: devuelve cada resultado en la respuesta de la solicitud saliente de Ezra. La Mac y el trabajador tienen que seguir encendidos. El workflow no sustituye al motor de agentes, al renderizador ni al calendario de Granjas.

Límite inicial: 8 MB de cuerpo por llamada (archivos hasta 7,5 MB para dejar espacio al multipart). Facebook: texto o un archivo. Instagram: un Reel MP4 por subida directa; las imágenes locales y carruseles siguen sin enlace público de almacenamiento autorizado. No se promete soporte completo de esos formatos.

No se envía una publicación de prueba sin revisar y autorizar su contenido y cuenta exactos.
