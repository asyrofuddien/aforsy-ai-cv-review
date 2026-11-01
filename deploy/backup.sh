#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/landly}"
KEY_DIR="${KEY_DIR:-$HOME/.config/landly-backup}"
KEY_FILE="${KEY_FILE:-$KEY_DIR/backup.passphrase}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p -m 700 "$BACKUP_DIR" "$KEY_DIR"
chmod 700 "$BACKUP_DIR" "$KEY_DIR"

if [[ ! -s "$KEY_FILE" ]]; then
  (umask 077; openssl rand -hex 32 > "$KEY_FILE")
fi
chmod 600 "$KEY_FILE"

work_dir="$(mktemp -d "$BACKUP_DIR/.work-${STAMP}.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

docker exec cv-evaluation-mongodb sh -c \
  'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db cv-evaluation --archive' \
  > "$work_dir/mongodb.archive"
test -s "$work_dir/mongodb.archive"

tar -C "$APP_DIR" -czf "$work_dir/uploads.tar.gz" uploads
tar -C "$work_dir" -czf "$work_dir/payload.tar.gz" mongodb.archive uploads.tar.gz

archive="$BACKUP_DIR/landly-${STAMP}.tar.gz.gpg"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$KEY_FILE" \
  --symmetric --cipher-algo AES256 --output "$archive" "$work_dir/payload.tar.gz"
chmod 600 "$archive"
sha256sum "$archive" > "$archive.sha256"
chmod 600 "$archive.sha256"

# Keep seven daily restore points; the active run is never removed.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'landly-*.tar.gz.gpg' -o -name 'landly-*.tar.gz.gpg.sha256' \) \
  -mtime +6 -delete

echo "Encrypted backup created: $archive"
