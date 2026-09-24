#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
umask 077
backup_root=/var/backups/digital-cards
install -d -m 700 "$backup_root"
backup_dir="$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
was_active=false
if systemctl is-active --quiet digital-cards; then
  was_active=true
fi
resume_app() {
  if [[ "$was_active" == true ]]; then
    systemctl start digital-cards
  fi
}
trap resume_app EXIT
# Pause writes so the database and uploaded files describe one state.
systemctl stop digital-cards
runuser -u postgres -- pg_dump -Fc digital_cards > "$backup_dir/database.dump"
runuser -u postgres -- pg_dumpall --roles-only > "$backup_dir/roles.sql"
tar -C /var/lib/digital-cards -czf "$backup_dir/images.tar.gz" images
tar -C /etc -czf "$backup_dir/configuration.tar.gz" digital-cards
pg_restore --list "$backup_dir/database.dump" > /dev/null
tar -tzf "$backup_dir/images.tar.gz" > /dev/null
touch "$backup_dir/COMPLETE"
echo "Backup completed: $backup_dir"
echo "Copy it to protected off-server storage. It contains credentials."
