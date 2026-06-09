#!/bin/sh
# Create a single, consistent backup of the mTodo SQLite database.
#
# The database runs in WAL mode while the server holds it open, so we never copy
# the raw file directly. Instead we use the sqlite3 ".backup" command, which uses
# SQLite's online backup API to produce a transactionally consistent snapshot
# even while the app is writing to the database.
#
# The snapshot is gzipped and written to $BACKUP_DIR with a timestamped name.
# Backups older than $BACKUP_RETENTION_DAYS are pruned.
#
# Configuration (env vars, with sensible defaults):
#   DATABASE_FILE          Path to the live SQLite database. Default: /data/mtodo.sqlite
#   BACKUP_DIR             Folder backups are written to.    Default: /backups
#   BACKUP_RETENTION_DAYS  Days of backups to keep.          Default: 7
set -eu

DATABASE_FILE="${DATABASE_FILE:-/data/mtodo.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

log() {
  echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

if [ ! -f "$DATABASE_FILE" ]; then
  log "ERROR: database file not found at $DATABASE_FILE — nothing to back up."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u '+%Y%m%d-%H%M%S')"
tmp_file="$(mktemp "${BACKUP_DIR}/.mtodo-${timestamp}.XXXXXX.sqlite")"
final_file="${BACKUP_DIR}/mtodo-${timestamp}.sqlite.gz"

# Always clean up the temp snapshot (and its WAL/SHM sidecars, since the
# snapshot inherits the source's WAL journal mode), even if a later step fails.
cleanup() {
  rm -f "$tmp_file" "${tmp_file}-wal" "${tmp_file}-shm"
}
trap cleanup EXIT

log "Backing up $DATABASE_FILE ..."

# Online backup -> consistent snapshot (safe while the server is running / WAL).
sqlite3 "$DATABASE_FILE" ".backup '$tmp_file'"

# Verify the snapshot is a valid, uncorrupted SQLite database before keeping it.
integrity="$(sqlite3 "$tmp_file" 'PRAGMA integrity_check;')"
if [ "$integrity" != "ok" ]; then
  log "ERROR: integrity check failed on snapshot: $integrity"
  exit 1
fi

gzip -c "$tmp_file" > "$final_file"

size="$(du -h "$final_file" | cut -f1)"
log "Created backup: $final_file ($size)"

# Retention: delete gzipped backups older than the configured number of days.
deleted="$(find "$BACKUP_DIR" -name 'mtodo-*.sqlite.gz' -type f -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
if [ "$deleted" != "0" ]; then
  log "Pruned $deleted backup(s) older than ${BACKUP_RETENTION_DAYS} day(s)."
fi

log "Done. $(find "$BACKUP_DIR" -name 'mtodo-*.sqlite.gz' -type f | wc -l | tr -d ' ') backup(s) currently retained."
