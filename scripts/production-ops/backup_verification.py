"""Verify referenced payloads, not only the existence of a database dump."""
import base64
import hashlib
import json
import re
import sqlite3
import tarfile
from contextlib import closing
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ops_common import decrypt_file,digest


def unpack_verified(source,key,stage):
    stage=Path(stage).resolve(); payload=stage/'payload.tar.gz'
    decrypt_file(source,payload,key)
    with tarfile.open(payload,'r:gz') as tar:
        total=0
        for member in tar.getmembers():
            total+=member.size
            if total>2*1024**3 or not (member.isfile() or member.isdir()) or not (stage/member.name).resolve().is_relative_to(stage): raise ValueError('unsafe archive')
        tar.extractall(stage,filter='data')
    manifest=json.loads((stage/'manifest.json').read_text())
    for relative,expected in manifest['files'].items():
        target=(stage/relative).resolve()
        if not target.is_relative_to(stage) or digest(target)!=expected: raise ValueError('archive hash mismatch')
    return manifest


def verify_core_media(root,environment,snapshot_ms):
    root=Path(root)
    version=int(environment.get('STARLINK_ROUTER_KEY_ENCRYPTION_KEY_VERSION','1'))
    keys={int(k):base64.b64decode(v,validate=True) for k,v in json.loads(environment.get('STARLINK_ROUTER_KEY_ENCRYPTION_PREVIOUS_KEYS','{}') or '{}').items()}
    keys[version]=base64.b64decode(environment['STARLINK_ROUTER_KEY_ENCRYPTION_KEY'],validate=True)
    if any(v<=0 or len(k)!=32 for v,k in keys.items()): raise ValueError('invalid Core keyring')
    count=0
    with closing(sqlite3.connect((root/'data/core.sqlite3').resolve().as_uri()+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        for row in db.execute("SELECT * FROM video_work_media WHERE state<>'deleted' AND (leases_json<>'[]' OR (state='active' AND expires_at_ms>?))",(snapshot_ms,)):
            key=keys[row['key_version']]
            prefix=f"starlink-dimension-router:api-key-copy:v1:{row['key_version']}:work-media:{row['owner_key_id']}:{row['work_id']}:{row['media_id']}:"
            encrypted=row['encrypted_storage_ref']
            reference=json.loads(AESGCM(key).decrypt(encrypted[:12],encrypted[12:],(prefix+'ref').encode()))
            name=reference['file']
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,156}\.bin',name) or '..' in name: raise ValueError('invalid media path')
            file=root/'data/work-media'/name
            if not file.is_file() or file.is_symlink() or file.stat().st_size!=row['size_bytes'] or row['size_bytes']>32*1024**2+28: raise ValueError('required media missing or incomplete')
            encrypted=file.read_bytes(); plain=AESGCM(key).decrypt(encrypted[:12],encrypted[12:],(prefix+'content').encode())
            prefix_bytes=plain[:16]
            mime=('image/png' if prefix_bytes.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if prefix_bytes.startswith(b'\xff\xd8\xff') else 'image/gif' if prefix_bytes.startswith((b'GIF87a',b'GIF89a')) else 'image/webp' if prefix_bytes[:4]==b'RIFF' and prefix_bytes[8:12]==b'WEBP' else 'video/mp4' if prefix_bytes[4:8]==b'ftyp' else 'video/webm' if prefix_bytes.startswith(b'\x1a\x45\xdf\xa3') else None)
            if hashlib.sha256(plain).hexdigest()!=row['content_sha256'] or mime!=reference['mime']: raise ValueError('required media content mismatch')
            count+=1
    return count
