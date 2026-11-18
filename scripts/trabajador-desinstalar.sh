#!/bin/bash
# Detiene y quita el LaunchAgent del trabajador de granjas. No toca data/ ni el registro.
set -euo pipefail
ETIQUETA="com.spotmi.ezra.trabajador"
DESTINO="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
rm -f "$DESTINO"
echo "Trabajador desinstalado. Si pusiste EZRA_GRANJAS_TRABAJADOR=0 en .env.local, quítalo para que npm run dev vuelva a trabajar."
