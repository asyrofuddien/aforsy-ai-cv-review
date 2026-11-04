#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_DIR="$APP_DIR/deploy/secrets"
KEY_FILE="$SECRET_DIR/mongodb-keyfile"

mkdir -p -m 700 "$SECRET_DIR"
if [[ ! -s "$KEY_FILE" ]]; then
  openssl rand -base64 756 > "$KEY_FILE"
fi

mongo_uid="$(docker run --rm --entrypoint sh mongo:7.0-jammy -c 'id -u mongodb')"
mongo_gid="$(docker run --rm --entrypoint sh mongo:7.0-jammy -c 'id -g mongodb')"
chown "$mongo_uid:$mongo_gid" "$KEY_FILE"
chmod 400 "$KEY_FILE"
echo 'MongoDB replica-set keyfile is present with restricted permissions.'
