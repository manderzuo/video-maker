#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ "$EUID" -ne 0 || "$#" -ne 0 ]]; then
  echo 'Run as root without arguments for the configured Studio database and private directory' >&2
  exit 1
fi
snapshot="$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)"
data_root=/var/backups/aiwork-studio
secret_root=/var/backups/aiwork-studio-secrets
install -d -m 0700 "$data_root" "$secret_root"
data="$data_root/$snapshot"
secret="$secret_root/$snapshot"
install -d -m 0700 "$data" "$secret"
active=0
systemctl is-active --quiet aiwork-studio-cloud && active=1
restart() { if [[ "$active" -eq 1 ]]; then systemctl start aiwork-studio-cloud; fi; }
trap restart EXIT
if [[ "$active" -eq 1 ]]; then systemctl stop aiwork-studio-cloud; fi
runuser -u postgres -- pg_dump -Fc --no-owner --no-acl aiwork_studio > "$data/database.dump"
tar -czf "$data/private.tar.gz" -C /var/lib/aiwork-studio private
cp /etc/aiwork-studio/cloud-runtime.json "$data/runtime.json"
cp /opt/aiwork-studio/cloud-current/release.json "$data/release.json"
install -m 0600 /etc/aiwork-studio/cloud-secrets.json "$secret/keyring.json"
sha256sum "$data/database.dump" "$data/private.tar.gz" "$data/runtime.json" "$data/release.json" > "$data/SHA256SUMS"
sha256sum "$secret/keyring.json" > "$secret/SHA256SUMS"
printf 'Consistent backup completed: %s; keyring stored separately\n' "$snapshot"
