#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Run all idempotent migrations in one transaction, in order.
{
  echo 'BEGIN;'
  for sql in "$script_dir"/../backend/database/[0-9][0-9][0-9]-*.sql; do
    cat -- "$sql"
    echo
  done
  echo 'COMMIT;'
} | runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d digital_cards
