# Ezra en un servidor · `ezra.spotmi.com.sv`

Ezra corre una sola vez en un servidor y el equipo entra desde el navegador. Todos comparten los mismos datos
(granjas, eventos, encargos) y cada persona inicia sesión con su cuenta. Nadie instala nada para *usar* Ezra.
Para *programar* Ezra se sigue usando `npm run dev` o `compose.yaml` en la computadora de cada quien.

Archivos: `Dockerfile.produccion`, `compose.produccion.yaml`, `Caddyfile` (HTTPS automático),
`.env.produccion.example`, `scripts/datos-empaquetar.sh` (Mac → servidor), `scripts/respaldo-servidor.sh`.
`src/proxy.ts` solo acepta localhost y los dominios de `EZRA_DOMINIOS`.

## Lo que no funciona igual en el servidor

- Encargos con **Astra (Codex)** y **Claude**: usan la sesión de esos programas en tu Mac. En el servidor no
  están instalados; Gemini sí funciona (usa clave).
- **Clerk de producción** es una instancia nueva: las cuentas de desarrollo no pasan. Cada persona vuelve a
  registrarse con su correo; los permisos de Ezra (`data/access.json`) van por correo y se conservan.
- Las apps de Instagram, Facebook, TikTok y YouTube deben tener registrada la nueva dirección de regreso
  `https://ezra.spotmi.com.sv/conexiones/<canal>/callback`.

## 1. Servidor

Cualquier servidor Linux con Docker y 2 GB de RAM o más. Opción sin costo: Oracle Cloud «Always Free»
(Ampere A1, Ubuntu 24.04). Opción de pago: un VPS de unos USD 5 al mes.

- Abre los puertos **80 y 443** (en Oracle: *Security List* de la VCN **y** el firewall de Ubuntu:
  `sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save`).
- Instala Docker: `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER` (cierra y
  vuelve a abrir la sesión SSH).

## 2. DNS en DonDominio

El DNS de `spotmi.com.sv` está en **DonDominio** (`ns1/ns2.dondominio.com`); el sitio apunta a Vercel y no se toca.
En DonDominio › Dominios › `spotmi.com.sv` › Zona DNS, agrega:

| Tipo | Nombre | Valor             |
| ---- | ------ | ----------------- |
| A    | `ezra` | IP pública del servidor |

Comprueba con `dig +short ezra.spotmi.com.sv` (debe dar la IP). Puede tardar unos minutos.

## 3. Clerk de producción

En dashboard.clerk.com, en la app de Ezra: crear la instancia **Production** con el dominio
`ezra.spotmi.com.sv`. Clerk mostrará varios registros **CNAME** (por ejemplo `clerk.ezra…`): agrégalos tal cual
en DonDominio y espera a que Clerk los marque como verificados. Copia las claves `pk_live_…` y `sk_live_…`.

## 4. Código y configuración en el servidor

```sh
git clone git@github.com:rafa-sg/ezra.git && cd ezra   # el repo es privado: usa una deploy key de GitHub
git switch feat/despliegue-vps                         # o main cuando esté integrado
cp .env.produccion.example .env.produccion && nano .env.produccion
```

`EZRA_TOKEN_KEY` debe ser **el mismo** de tu `.env.local`, o los tokens de redes guardados no se podrán leer.

## 5. Pasar tus datos (una sola vez)

En tu Mac, con `npm run dev` detenido:

```sh
scripts/datos-empaquetar.sh                          # crea ~/Desktop/ezra-datos-AAAA-MM-DD.tar.gz
scp ~/Desktop/ezra-datos-*.tar.gz usuario@IP:~/ezra/
```

En el servidor:

```sh
C="docker compose --env-file .env.produccion -f compose.produccion.yaml"
$C build web
$C run --rm --no-deps -T --user root --entrypoint sh web \
  -c 'cd / && tar -xzf - && chown -R node:node /datos' < ezra-datos-AAAA-MM-DD.tar.gz
```

A partir de aquí los datos «de verdad» viven en el servidor. Lo que hagas en `npm run dev` en tu Mac ya no se
sincroniza: úsalo solo para programar.

## 6. Arrancar

```sh
$C up -d --build
$C logs -f web      # Ctrl+C para salir
```

Abre `https://ezra.spotmi.com.sv`. Caddy obtiene el certificado HTTPS solo, la primera vez.

## 7. Respaldos diarios

```sh
crontab -e
# 30 3 * * * cd ~/ezra && scripts/respaldo-servidor.sh >> ~/respaldos-ezra.log 2>&1
```

Guarda 14 días en `~/respaldos-ezra/`. Conviene bajar uno de vez en cuando a tu Mac
(`scp usuario@IP:~/respaldos-ezra/ezra-*.tar.gz .`). Restaurar = el mismo comando del paso 5 con ese archivo
(con `web` detenido: `$C stop web`).

## 8. Actualizar Ezra

```sh
cd ~/ezra && git pull && $C up -d --build
```

Al arrancar, la app migra la base SQLite como en tu Mac (con copia en `granjas/respaldos/`).
