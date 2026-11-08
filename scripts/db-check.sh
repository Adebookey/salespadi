#!/usr/bin/env bash
# Applies every migration + seed to a scratch Postgres database and runs the RLS tests.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL="${DATABASE_URL:?set DATABASE_URL to a Postgres you can create databases on}"
DB="salespadi_check_$$"
psql "$ADMIN_URL" -qc "create database $DB" >/dev/null
trap 'psql "$ADMIN_URL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL="${ADMIN_URL%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; echo "applied $f"; done
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql >/dev/null && echo "applied seed"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
