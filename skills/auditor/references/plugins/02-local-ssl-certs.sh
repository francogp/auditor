#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="certs"
KEY_FILE="$CERT_DIR/localhost-key.pem"
CERT_FILE="$CERT_DIR/localhost.pem"

echo "🔐 [Plugin 02] Verificando certificados SSL locales para desarrollo..."

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
  echo "  ✅ Certificados SSL locales ya existen en $CERT_DIR/."
  exit 0
fi

mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "  🔑 Generando certificados con mkcert..."
  mkcert -install
  mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" localhost 127.0.0.1 ::1
  echo "  ✅ Certificados generados correctamente."
else
  echo "  ⚠️ mkcert no encontrado. Omitiendo generación automática de SSL."
  echo "     Para HTTPS local, instala mkcert: https://github.com/FiloSottile/mkcert"
fi
