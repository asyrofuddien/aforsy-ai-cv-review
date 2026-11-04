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

docker run --rm \
  --mount "type=bind,src=$SECRET_DIR,dst=/secrets" \
  --entrypoint sh mongo:7.0-jammy \
  -c 'chown 999:999 /secrets/mongodb-keyfile && chmod 400 /secrets/mongodb-keyfile'
echo 'MongoDB replica-set keyfile is present with restricted permissions.'
