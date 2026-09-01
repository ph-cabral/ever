#!/usr/bin/env bash
# Deploy de ever en el server (10.10.0.159).
# Lo usa el workflow de GitHub Actions (.github/workflows/deploy.yml)
# y tambien sirve a mano:  ssh server -> cd ~/projects/vicki_web -> ./deploy.sh
#
# OJO: hace 'git reset --hard origin/main'. En el server NO se edita codigo,
# asi que cualquier cambio local ahi es basura y se descarta a proposito.
# El .env NO esta en git -> no se toca.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.prod.yml
BRANCH=main

echo "==> [1/5] traigo main de GitHub"
git fetch --prune origin
git reset --hard "origin/$BRANCH"
echo "    commit: $(git log -1 --format='%h %s')"

echo "==> [2/5] build + up"
# BUILDX_NO_DEFAULT_ATTESTATIONS: sin esto buildx genera manifiestos de
# provenance/SBOM que no usamos y agregan ~20s por build (y fuerzan el camino
# de "exporting manifest list" + "unpacking").
BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker compose -f "$COMPOSE_FILE" up -d --build "$@"

echo "==> [3/5] limpio imagenes viejas"
docker image prune -f >/dev/null

echo "==> [4/5] podo cache de build"
# 'docker image prune -f' solo borra imagenes dangling: la cache de BuildKit NO
# la toca y crece sin techo (llego a 411 GB / 3449 registros y el build paso a
# estar limitado por I/O: 'exporting layers' 69s, GC corriendo en paralelo).
# --keep-storage deja lo suficiente para que el proximo build siga usando cache.
docker builder prune -f --keep-storage 20GB >/dev/null

echo "==> [5/5] estado"
docker compose -f "$COMPOSE_FILE" ps
df -h /var/lib/docker | tail -1
