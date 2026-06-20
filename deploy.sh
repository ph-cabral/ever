#!/usr/bin/env bash
# Deploy de 'ever' en el server (10.10.0.159).
# Correr DENTRO de la carpeta del repo, en el server:  ./deploy.sh
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
# Si tu server usa la versión vieja, descomentá la línea de abajo:
# COMPOSE="docker-compose -f docker-compose.prod.yml"

echo "==> 1/3  git pull"
git pull

echo "==> 2/3  rebuild + up (Docker)"
$COMPOSE up -d --build

echo "==> 3/3  estado"
$COMPOSE ps

echo
echo "OK. App: http://10.10.0.159:3001"
