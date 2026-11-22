#!/usr/bin/env bash
# Respaldo diario de Ezra en el servidor: base SQLite (copia coherente) + medios + accesos.
# Uso: scripts/respaldo-servidor.sh [carpeta]   (por defecto ~/respaldos-ezra; guarda 14 días)
set -euo pipefail
cd "$(dirname "$0")/.."
destino="${1:-$HOME/respaldos-ezra}"
mkdir -p "$destino"
archivo="$destino/ezra-$(date +%Y-%m-%d_%H%M).tar.gz"
compose=(docker compose --env-file .env.produccion -f compose.produccion.yaml)

"${compose[@]}" exec -T web node scripts/respaldo-sqlite.mjs /tmp/granjas.sqlite
"${compose[@]}" exec -T web sh -c '
  tar -czf - \
    --exclude="datos/granjas/granjas.sqlite" \
    --exclude="datos/granjas/granjas.sqlite-wal" \
    --exclude="datos/granjas/granjas.sqlite-shm" \
    -C / datos \
    $( [ -f /tmp/granjas.sqlite ] && echo "-C /tmp granjas.sqlite" )
' > "$archivo"
"${compose[@]}" exec -T web rm -f /tmp/granjas.sqlite
find "$destino" -name 'ezra-*.tar.gz' -mtime +14 -delete
echo "Respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
