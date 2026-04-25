#!/usr/bin/env bash
set -euo pipefail
COMPOSE="docker compose -f docker-compose.polar.yml"
$COMPOSE up -d
echo "Waiting for LND nodes…"
for n in alice bob; do
  for i in $(seq 1 60); do
    if $COMPOSE exec -T "$n" lncli --network=regtest getinfo >/dev/null 2>&1; then
      echo "$n ready"
      break
    fi
    sleep 1
  done
done
