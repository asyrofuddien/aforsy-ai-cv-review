#!/usr/bin/env bash
set -euo pipefail

CONTAINER="cv-evaluation-mongodb"

for attempt in $(seq 1 45); do
  if docker exec "$CONTAINER" mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q '^1$'; then
    break
  fi
  if [[ "$attempt" -eq 45 ]]; then
    echo 'MongoDB did not become ready for replica-set initialization.' >&2
    exit 1
  fi
  sleep 2
done

docker exec "$CONTAINER" sh -c 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "const hello=db.adminCommand({hello:1}); if (!hello.setName) { const result=rs.initiate({_id:\"rs0\",members:[{_id:0,host:\"127.0.0.1:27017\"}]}); if (!result.ok) quit(1); } print(\"replica-set initialized\");"' >/dev/null

for attempt in $(seq 1 45); do
  primary="$(docker exec "$CONTAINER" sh -c 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand({hello:1}).isWritablePrimary"' 2>/dev/null | tail -n 1 || true)"
  if [[ "$primary" == 'true' ]]; then
    echo 'MongoDB replica set rs0 is primary and ready.'
    exit 0
  fi
  sleep 2
done

echo 'MongoDB replica set did not elect a primary.' >&2
exit 1
