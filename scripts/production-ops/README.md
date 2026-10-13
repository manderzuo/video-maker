# Production operations

These tools monitor business progress and preserve recoverable data. They never submit AI requests, reset a billing hold, replay a task, or restart a live process merely because a provider response is slow.

## Installed services

- Linux code: `/opt/aiwork-production/`. Private state: `/var/lib/aiwork-production/health.json`.
- `aiwork-production-monitor.timer`: every two minutes. A critical condition makes its service fail visibly in systemd; alert changes and hourly reminders are recorded in the journal. Public `/healthz` remains a liveness endpoint.
- `aiwork-production-backup.timer`: daily at approximately 02:30 Asia/Shanghai. Capture an online PostgreSQL dump and SQLite backup, copy private media/configuration/key material, restore into a fresh isolated PostgreSQL database, verify original/thumbnail checksums and SQLite integrity, then encrypt the complete archive with streaming AES-256-GCM. A failed capture or verification never replaces the last successful backup.
- Encrypted Linux bundles: `/var/backups/aiwork-production/`, seven completed generations. Incomplete and unrelated files are not pruned.
- Windows code/state: `E:/AIWORK/production-ops/`, restricted to the current Windows user, SYSTEM and Administrators. `AIWork-Production-Supervisor` runs every minute and at logon; it starts only the configured production application/FRP if absent and uses a five-minute app-start backoff. `AIWork-Production-Backup` checks every thirty minutes, mirrors verified Linux ciphertext and produces a Windows recovery snapshot at most once per twenty hours.

The Windows supervisor uses the original interactive user and production launcher. A locked or disconnected logged-in session continues running. After a full logoff/reboot, the application still requires that user to log on. The scripts do not configure password-based autologon or migrate DPAPI-protected execution identities into another Windows account.

## Checks and alert handling

The private collector checks service/bridge reachability, active task age, unfinalized prompt results, unknown outcomes, continuation attention, settlement age, available disk space and backup/mirror freshness. Windows sends a fresh lightweight ledger/disk heartbeat at every sync, independently of its daily backup. Thresholds: active task 30 minutes, finalization 5 minutes, pending receipt 1 hour, backup/mirror 30 hours, Windows heartbeat 1 hour, disk free below 15 percent (critical below 8 percent).

These are operational attention thresholds, not provider execution deadlines. An alert must not convert an unknown execution into failed/no-charge. Inspect only the original request/task/account and its immutable budget evidence. After eight retryable continuation failures, application state requires operator attention; resuming UI polling does not authorize another paid submission.

Inspect alerts with `sudo systemctl status aiwork-production-monitor.service` and `sudo journalctl -u aiwork-production-monitor.service`. No email, chat or phone notification destination is configured by these tools. Connect an approved monitoring channel to the systemd/journal signal if off-device paging is required.

Old pending receipts remain occupied until authoritative usage/receipt evidence proves their final cost. Before any settlement repair, preserve a consistent database backup and collect original budget/request/account identity, dispatch count, execution result, receipt evidence and already-posted ledger entries. Do not blanket-release old holds, substitute another account's usage, or infer zero cost from a missing result. Core's controlled attention-resume procedure belongs in the release record and applies only to scheduling metadata of the same proven-safe request.

## Maintenance inhibition

Before intentionally stopping AI Work for host-lease tests or activation, create `E:/AIWORK/production-ops/maintenance.json` with the maintenance purpose and timestamp. The supervisor exits without starting anything while that file exists. Remove only that exact file after activation, original identity/financial checks and bridge recovery complete. A forgotten maintenance marker should be investigated, not automatically expired during a long test or restore.

Linux application deployment is independent of these timers. Avoid a concurrent backup during coordinated schema/ledger activation: stop the backup timer, let any active backup finish, perform the reviewed maintenance and restart the timer. The daily backup does not stop production services or launch restored application workers.

## Recovery and keys

Linux AES key: `/etc/aiwork-production/backup.key`, root-only. Its Windows copy is DPAPI-protected as `backup-key.dpapi`; the key never appears in command output, repository files or archive metadata. Each complete encrypted bundle is mirrored to the other existing host and checked by SHA-256; Linux-to-Windows copies are additionally authenticated by decrypting into a private temporary file which is then removed.

Run `sudo python3 /opt/aiwork-production/linux_ops.py verify /var/backups/aiwork-production/<bundle>.aes` to authenticate/decrypt and perform another isolated restore check. This creates a unique `aiwork_restore_<uuid>` database, starts no workers and drops only that database in a finally block.

The Linux payload contains Studio database/private files/runtime/versioned keyring and Core SQLite/config/bridge secret/persistent media plus the Core encryption environment required to decrypt its records. Validation decrypts every leased or snapshot-valid Core media reference with its recorded key version, then checks the encrypted file length, authenticated content, plaintext SHA-256 and MIME. A missing required file rejects the entire new generation. A production restore must restore the matching application release and schema, then reconcile original in-flight identities before admitting paid work. Never run the restored app against production providers as a test.

Windows backups preserve the ledger, configuration JSON, vault and profiles. Validate the SQLite copy and that the original Windows user can unlock the vault key. The Linux recipient authenticates/decrypts the bundle with its own copy of the backup key and checks the manifest, ledger and vault presence before accepting it. Their DPAPI-protected records require the original Windows identity/machine recovery context; an off-host file copy is not an automatic cross-machine credential migration. Preserve the Windows system/profile recovery capability or implement a separately reviewed identity migration before replacing that machine.

## Validation

`python -m unittest discover -s scripts/production-ops -p test_ops.py` covers hidden stalled-work alerts, failed/missing collection, authenticated encryption with tamper rejection, WAL-safe snapshots preserving unresolved holds, and retention boundaries. Linux installation additionally verifies systemd units, runs a real isolated restore and validates private media hashes. PowerShell syntax is parsed before installation; the live supervisor is first run against the existing processes and must report one application and one intended relay without launching duplicates.
