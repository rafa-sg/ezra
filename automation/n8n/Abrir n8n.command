#!/bin/zsh
# n8n local para ezrá. Solo escucha en esta computadora y no envía telemetría.
set -e
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
N8N_DIR="$HOME/n8n-local"
if [ ! -x "$N8N_DIR/node_modules/.bin/n8n" ]; then
  echo "n8n no está instalado en $N8N_DIR."
  echo "Instálalo con: mkdir -p ~/n8n-local && cd ~/n8n-local && npm install --save-exact n8n@2.41.6"
  read -r "?Pulsa Enter para cerrar."
  exit 1
fi
export N8N_LISTEN_ADDRESS=127.0.0.1
export N8N_HOST=127.0.0.1
export N8N_PORT=5678
export N8N_PROTOCOL=http
export GENERIC_TIMEZONE=America/El_Salvador
export TZ=America/El_Salvador
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_VERSION_NOTIFICATIONS_ENABLED=false
export N8N_TEMPLATES_ENABLED=false
export N8N_PERSONALIZATION_ENABLED=false
export N8N_HIRING_BANNER_ENABLED=false
export N8N_PUBLIC_API_DISABLED=true
export N8N_COMMUNITY_PACKAGES_ENABLED=false
echo "n8n local · http://127.0.0.1:5678"
echo "Datos y clave de cifrado en ~/.n8n: inclúyelos en tus copias de seguridad, nunca en Git."
echo "Conserva esta terminal abierta. Para detener n8n: Control + C."
exec "$N8N_DIR/node_modules/.bin/n8n" start
