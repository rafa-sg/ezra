#!/usr/bin/env bash
# En TU COMPUTADORA: empaqueta data/ para subirla al servidor (una sola vez, al mudarte).
# Detén antes `npm run dev` para que nadie escriba mientras tanto.
# Uso: scripts/datos-empaquetar.sh   → crea ezra-datos-AAAA-MM-DD.tar.gz en el Escritorio
set -euo pipefail
cd "$(dirname "$0")/.."
temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT
mkdir -p "$temporal/datos"
# Todo data/ salvo la base viva (se copia aparte de forma coherente).
tar -cf - --exclude='granjas/granjas.sqlite' --exclude='granjas/granjas.sqlite-wal' \
  --exclude='granjas/granjas.sqlite-shm' -C data . | tar -xf - -C "$temporal/datos"
EZRA_DATA_DIR="$PWD/data" node scripts/respaldo-sqlite.mjs "$temporal/datos/granjas/granjas.sqlite"
archivo="$HOME/Desktop/ezra-datos-$(date +%Y-%m-%d).tar.gz"
tar -czf "$archivo" -C "$temporal" datos
echo "Listo: $archivo ($(du -h "$archivo" | cut -f1)). Súbelo al servidor siguiendo docs/DESPLIEGUE_VPS.md."
