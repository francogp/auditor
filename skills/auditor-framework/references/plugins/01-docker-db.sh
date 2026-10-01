#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="facturacion-postgres"
IMAGE="postgres:16-alpine"
DB_PORT="5432"

echo "🐘 [Plugin 01] Verificando contenedor Docker de Base de Datos ($CONTAINER_NAME)..."

if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️ Docker no está instalado en este sistema. Omitiendo arranque de DB."
  exit 0
fi

if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  ✅ Contenedor $CONTAINER_NAME ya está en ejecución."
elif [ "$(docker ps -aq -f status=exited -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  🔄 Iniciando contenedor existente $CONTAINER_NAME..."
  docker start "$CONTAINER_NAME" >/dev/null
  echo "  ✅ Contenedor iniciado."
else
  echo "  🚀 Creando y arrancando nuevo contenedor $CONTAINER_NAME..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=facturacion \
    -p "${DB_PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "  ✅ Contenedor $CONTAINER_NAME creado y escuchando en puerto $DB_PORT."
fi
