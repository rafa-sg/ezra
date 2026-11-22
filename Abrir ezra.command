#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node.js 22 o posterior y vuelve a abrir este archivo."
  read -r "?Pulsa Enter para cerrar."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Primera instalación: ejecuta npm ci dentro de la carpeta del proyecto."
  read -r "?Pulsa Enter para cerrar."
  exit 1
fi
echo "ezrá · Tu estudio de Spotmi"
echo "Abre la dirección Local que aparecerá abajo en tu navegador."
echo "Conserva esta terminal abierta. Para detener el estudio: Control + C."
npm run dev
