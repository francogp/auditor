#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="app-postgres"
IMAGE="postgres:16-alpine"
DB_PORT="5432"

echo "[Plugin 01] Verifying Docker Database container ($CONTAINER_NAME)..."

if ! command -v docker >/dev/null 2>&1; then
  echo "  [WARN] Docker is not installed on this system. Skipping database startup."
  exit 0
fi

if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  [OK] Container $CONTAINER_NAME is already running."
elif [ "$(docker ps -aq -f status=exited -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  [START] Starting existing container $CONTAINER_NAME..."
  docker start "$CONTAINER_NAME" >/dev/null
  echo "  [OK] Container started."
else
  echo "  [CREATE] Creating and starting new container $CONTAINER_NAME..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=app_db \
    -p "${DB_PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "  [OK] Container $CONTAINER_NAME created and listening on port $DB_PORT."
fi
