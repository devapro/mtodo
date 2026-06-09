# Lightweight backup sidecar: just the sqlite3 CLI + the backup/restore scripts.
# Mounts the same SQLite data volume as the server (read) and a backups folder.
FROM alpine:3.20

# sqlite -> sqlite3 CLI (online .backup), coreutils -> GNU `date -d` for scheduling.
RUN apk add --no-cache sqlite coreutils

WORKDIR /scripts
COPY docker/backup/ /scripts/
RUN chmod +x /scripts/*.sh

# Run a backup immediately, then once per day (see scheduler.sh).
CMD ["sh", "/scripts/scheduler.sh"]
