#!/bin/sh
# Restore the mTodo SQLite database from a backup created by backup.sh.
#
# IMPORTANT: stop the server before restoring so it does not hold the database
# open or write to it mid-restore, e.g.:
#   docker compose -p mtodo stop server
#   docker compose -p mtodo run --rm backup /scripts/restore.sh
#   docker compose -p mtodo start server
#
# Usage:
#   restore.sh                 Restore from the most recent backup in $BACKUP_DIR.
#   restore.sh <file.gz>       Restore from a specific backup (path or name in $BACKUP_DIR).
#   restore.sh --list          List available backups and exit.
#
# Configuration (env vars):
#   DATABASE_FILE  Path to the live SQLite database. Default: /data/mtodo.sqlite
#   BACKUP_DIR     Folder backups live in.           Default: /backups
set -eu

DATABASE_FILE="${DATABASE_FILE:-/data/mtodo.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

log() {
  echo "[restore] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

list_backups() {
  find "$BACKUP_DIR" -name 'mtodo-*.sqlite.gz' -type f 2>/dev/null | sort
}

if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
  log "Available backups in ${BACKUP_DIR}:"
  list_backups || true
  exit 0
fi

# Resolve which backup file to restore from.
if [ -n "${1:-}" ]; then
  if [ -f "$1" ]; then
    backup_file="$1"
  elif [ -f "${BACKUP_DIR}/$1" ]; then
    backup_file="${BACKUP_DIR}/$1"
  else
    log "ERROR: backup file not found: $1"
    exit 1
  fi
else
  backup_file="$(list_backups | tail -n 1)"
  if [ -z "$backup_file" ]; then
    log "ERROR: no backups found in ${BACKUP_DIR}."
    exit 1
  fi
  log "No file specified; using most recent backup."
fi

log "Restoring from: $backup_file"

tmp_file="$(mktemp /tmp/mtodo-restore.XXXXXX.sqlite)"
cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

# Decompress into a temp file and verify before touching the live database.
gunzip -c "$backup_file" > "$tmp_file"

integrity="$(sqlite3 "$tmp_file" 'PRAGMA integrity_check;')"
if [ "$integrity" != "ok" ]; then
  log "ERROR: backup failed integrity check ($integrity); aborting restore."
  exit 1
fi

mkdir -p "$(dirname "$DATABASE_FILE")"

# Safety net: keep a copy of the current database before overwriting it.
if [ -f "$DATABASE_FILE" ]; then
  safety="${DATABASE_FILE}.pre-restore.$(date -u '+%Y%m%d-%H%M%S')"
  cp "$DATABASE_FILE" "$safety"
  log "Saved current database to: $safety"
fi

# Remove stale WAL/SHM sidecar files so the restored database is authoritative.
rm -f "${DATABASE_FILE}-wal" "${DATABASE_FILE}-shm"

# Atomic-ish replace: copy into place on the same filesystem, then move.
cp "$tmp_file" "${DATABASE_FILE}.restoring"
mv "${DATABASE_FILE}.restoring" "$DATABASE_FILE"

log "Restore complete. Database replaced at: $DATABASE_FILE"
log "Start the server again to use the restored data."
