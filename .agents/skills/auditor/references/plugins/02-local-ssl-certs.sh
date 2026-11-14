#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="certs"
KEY_FILE="$CERT_DIR/localhost-key.pem"
CERT_FILE="$CERT_DIR/localhost.pem"

echo "[Plugin 02] Verifying local development SSL certificates..."

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
  echo "  [OK] Local SSL certificates already exist in $CERT_DIR/."
  exit 0
fi

mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "  [GEN] Generating certificates with mkcert..."
  mkcert -install
  mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" localhost 127.0.0.1 ::1
  echo "  [OK] Certificates successfully generated."
else
  echo "  [WARN] mkcert not found. Skipping automatic SSL generation."
  echo "     For local HTTPS, install mkcert: https://github.com/FiloSottile/mkcert"
fi
