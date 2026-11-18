#!/bin/bash
# Instala el LaunchAgent del trabajador de granjas (arranca al iniciar sesión y se reinicia si se cae).
# Uso: bash scripts/trabajador-instalar.sh   ·   Deshacer: bash scripts/trabajador-desinstalar.sh
set -euo pipefail
ETIQUETA="com.spotmi.ezra.trabajador"
PROYECTO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
DESTINO="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOG="$HOME/Library/Logs/ezra-trabajador.log"
if [ -z "$NODE" ]; then echo "No encontré node en el PATH. Instálalo (versión 22 o superior) y vuelve a correr este script."; exit 1; fi
if [ ! -d "$PROYECTO/node_modules/tsx" ]; then echo "Falta node_modules: corre «npm ci» en $PROYECTO primero."; exit 1; fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
# El PATH incluye Homebrew para ffmpeg y las herramientas locales (codex, claude).
RUTAS="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
sed -e "s#__NODE__#$NODE#g" -e "s#__PROYECTO__#$PROYECTO#g" -e "s#__PATH__#$RUTAS#g" -e "s#__LOG__#$LOG#g" \
  "$PROYECTO/ops/macos/$ETIQUETA.plist" > "$DESTINO"
plutil -lint "$DESTINO" >/dev/null
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DESTINO"
launchctl enable "gui/$(id -u)/$ETIQUETA"
echo "Trabajador instalado: $DESTINO"
echo "Registro: $LOG  (tail -f \"$LOG\")"
echo "Estado:   launchctl print gui/$(id -u)/$ETIQUETA | grep -E 'state|pid'"
echo "Para que el servidor de desarrollo no arranque un segundo trabajador, agrega EZRA_GRANJAS_TRABAJADOR=0 a .env.local y reinicia npm run dev."
