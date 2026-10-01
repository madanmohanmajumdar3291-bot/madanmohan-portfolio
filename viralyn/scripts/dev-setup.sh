#!/usr/bin/env bash
# One-shot local setup for a fresh Linux/cloud container: Postgres + deps + migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
(service postgresql start || pg_ctlcluster 16 main start) >/dev/null 2>&1 || true
for _ in $(seq 1 15); do pg_isready -q && break; sleep 1; done
su postgres -c "psql -tAc \"select 1 from pg_roles where rolname='viralyn'\"" | grep -q 1 || su postgres -c "psql -qc \"create role viralyn login password 'viralyn'\""
su postgres -c "psql -tAc \"select 1 from pg_database where datname='viralyn'\"" | grep -q 1 || su postgres -c "psql -qc 'create database viralyn owner viralyn'"
[ -f .env.local ] || { cp .env.example .env.local; sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|; s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 16)|" .env.local; }
[ -d node_modules ] || npm ci
DATABASE_URL="$(grep ^DATABASE_URL= .env.local | cut -d= -f2-)" npm run db:migrate
echo "Ready: npm run dev (AI key read from AI_API_KEY in the environment or .env.local)"
