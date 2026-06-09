#!/bin/sh
# Long-running scheduler for the backup container.
#
# Behaviour:
#   1. Takes one backup immediately on startup, so a fresh snapshot exists right
#      after the project is deployed.
#   2. Then sleeps until the next $BACKUP_TIME (HH:MM, UTC) and takes a backup,
#      repeating every 24h. This keeps a daily backup without depending on a
#      system cron daemon.
#
# Configuration (env vars):
#   BACKUP_TIME  Daily backup time as HH:MM in UTC. Default: 03:00
#   (plus everything backup.sh understands: DATABASE_FILE, BACKUP_DIR, ...)
set -eu

BACKUP_TIME="${BACKUP_TIME:-03:00}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log() {
  echo "[scheduler] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

# Seconds from now until the next occurrence of BACKUP_TIME (UTC).
seconds_until_next_run() {
  now_epoch="$(date -u +%s)"
  today_target="$(date -u -d "today ${BACKUP_TIME}" +%s 2>/dev/null || true)"

  # BusyBox `date` (alpine) does not support `-d "today HH:MM"`; fall back to
  # building the target from the current date components.
  if [ -z "${today_target}" ]; then
    today_date="$(date -u +%Y-%m-%d)"
    today_target="$(date -u -d "${today_date} ${BACKUP_TIME}" +%s 2>/dev/null || true)"
  fi
  if [ -z "${today_target}" ]; then
    # Last-resort fallback for very limited `date` implementations: just wait 24h.
    echo 86400
    return
  fi

  if [ "$today_target" -le "$now_epoch" ]; then
    # Target already passed today -> schedule for tomorrow.
    echo $(( today_target + 86400 - now_epoch ))
  else
    echo $(( today_target - now_epoch ))
  fi
}

log "Backup scheduler started. Daily backup time: ${BACKUP_TIME} UTC."

# Initial backup so there is always a snapshot right after deployment.
log "Running initial backup on startup..."
sh "${SCRIPT_DIR}/backup.sh" || log "WARNING: initial backup failed (see logs above)."

while true; do
  wait_seconds="$(seconds_until_next_run)"
  log "Next backup in ${wait_seconds}s (at ${BACKUP_TIME} UTC)."
  sleep "$wait_seconds"
  sh "${SCRIPT_DIR}/backup.sh" || log "WARNING: scheduled backup failed (see logs above)."
done
