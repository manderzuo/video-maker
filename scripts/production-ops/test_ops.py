import json
import base64
import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing

from ops_common import alerts_for, encrypt_file, decrypt_file, sqlite_snapshot, prune_bundles


class ProductionOpsTests(unittest.TestCase):
    def test_snapshot_rejects_missing_leased_core_media_even_with_valid_sqlite(self):
        from backup_verification import verify_core_media
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'data/work-media').mkdir(parents=True)
            key=bytes(range(32)); nonce=b'fixtureNonce'
            content=b'\x89PNG\r\n\x1a\nfixture'
            prefix='starlink-dimension-router:api-key-copy:v1:2:work-media:key:work:media:'
            reference=nonce+AESGCM(key).encrypt(nonce,json.dumps({'file':'owned.bin','filename':'source.png','mime':'image/png'}).encode(),(prefix+'ref').encode())
            encrypted=nonce+AESGCM(key).encrypt(nonce,content,(prefix+'content').encode())
            env={'STARLINK_ROUTER_KEY_ENCRYPTION_KEY':base64.b64encode(b'z'*32).decode(),'STARLINK_ROUTER_KEY_ENCRYPTION_KEY_VERSION':'3','STARLINK_ROUTER_KEY_ENCRYPTION_PREVIOUS_KEYS':json.dumps({'2':base64.b64encode(key).decode()})}
            with closing(sqlite3.connect(root/'data/core.sqlite3')) as db:
                db.execute('CREATE TABLE video_work_media(media_id,owner_key_id,work_id,key_version,encrypted_storage_ref,size_bytes,content_sha256,state,expires_at_ms,leases_json)')
                db.execute('INSERT INTO video_work_media VALUES(?,?,?,?,?,?,?,?,?,?)',('media','key','work',2,reference,len(encrypted),hashlib.sha256(content).hexdigest(),'active',1,'["original-request"]')); db.commit()
            with self.assertRaises(ValueError): verify_core_media(root,env,1000)
            (root/'data/work-media/owned.bin').write_bytes(encrypted)
            self.assertEqual(verify_core_media(root,env,1000),1)
            (root/'data/work-media/owned.bin').write_bytes(encrypted[:-1]+bytes([encrypted[-1]^1]))
            with self.assertRaises(Exception): verify_core_media(root,env,1000)

    def test_healthy_http_does_not_hide_stuck_work_or_old_receipts(self):
        state = dict(services_ok=True, bridge_ok=True, disk_free_percent=42,
                     backup_age_hours=2, mirror_age_hours=2, oldest_active_minutes=1320,
                     oldest_receipt_hours=365, pending_receipts=23,
                     oldest_finalization_minutes=10)
        codes = {a['code'] for a in alerts_for(state)}
        self.assertEqual(codes, {'task_stalled', 'receipt_overdue', 'finalization_stalled'})

    def test_missing_backup_and_collector_failure_are_not_reported_healthy(self):
        state = dict(services_ok=True, bridge_ok=True, disk_free_percent=5,
                     backup_age_hours=None, mirror_age_hours=None, collection_errors=1)
        codes = {a['code'] for a in alerts_for(state)}
        self.assertEqual(codes, {'disk_low', 'backup_missing', 'mirror_missing', 'collection_failed'})

    def test_streamed_archive_roundtrip_and_tamper_never_publish_plaintext(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'source'; encrypted=root/'backup.aes'; out=root/'out'
            source.write_bytes(b'private archive\x00' * 300000)
            key=bytes(range(32)); encrypt_file(source, encrypted, key)
            self.assertNotIn(b'private archive', encrypted.read_bytes())
            decrypt_file(encrypted, out, key)
            self.assertEqual(out.read_bytes(), source.read_bytes())
            out.unlink()
            with encrypted.open('r+b') as stream:
                stream.seek(40); value=stream.read(1); stream.seek(40); stream.write(bytes([value[0]^1]))
            with self.assertRaises(Exception): decrypt_file(encrypted, out, key)
            self.assertFalse(out.exists())
            self.assertFalse((root/'out.part').exists())

    def test_online_snapshot_includes_wal_and_preserves_unresolved_billing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); db=root/'live.db'; out=root/'copy.db'
            with closing(sqlite3.connect(db)) as live:
                live.execute('PRAGMA journal_mode=WAL')
                live.execute('CREATE TABLE holds(stage text,amount integer)')
                live.execute("INSERT INTO holds VALUES('P',185),('R',40)"); live.commit()
                sqlite_snapshot(db,out)
                with closing(sqlite3.connect(out)) as copy:
                    self.assertEqual(copy.execute('SELECT stage,amount FROM holds').fetchall(), [('P',185),('R',40)])
                self.assertEqual(live.execute('SELECT count(*) FROM holds').fetchone()[0],2)

    def test_retention_preserves_unrelated_files_and_newest_completed_bundles(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for number in range(1,5):
                name=f'production-202610{number:02d}T040000Z'
                (root/(name+'.aes')).write_bytes(b'archive')
                (root/(name+'.json')).write_text(json.dumps({'file':name+'.aes','sha256':'a'*64}))
            (root/'family.aes').write_bytes(b'unrelated')
            (root/'production-20261005T040000Z.aes.part').write_bytes(b'in progress')
            prune_bundles(root,keep=2)
            self.assertEqual(sorted(p.name for p in root.glob('production-*.aes')),
                             ['production-20261003T040000Z.aes','production-20261004T040000Z.aes'])
            self.assertTrue((root/'family.aes').exists())
            self.assertTrue((root/'production-20261005T040000Z.aes.part').exists())


if __name__ == '__main__': unittest.main()
