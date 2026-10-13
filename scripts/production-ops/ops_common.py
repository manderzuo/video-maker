"""Private operational helpers; no provider submission or billing mutation."""
import hashlib
import json
import os
import re
import sqlite3
import time
from contextlib import closing
from pathlib import Path

MAGIC = b'AIWBAK1\n'
BUNDLE = re.compile(r'production-\d{8}T\d{6}Z\.aes$')


def alerts_for(state):
    alerts=[]
    def add(code, severity='warning'): alerts.append({'code':code,'severity':severity})
    if not state.get('services_ok',False): add('service_unavailable','critical')
    if not state.get('bridge_ok',False): add('bridge_unavailable','critical')
    if state.get('collection_errors',0): add('collection_failed','critical')
    if state.get('disk_free_percent',100)<15: add('disk_low','critical' if state['disk_free_percent']<8 else 'warning')
    for field,prefix in [('backup_age_hours','backup'),('mirror_age_hours','mirror')]:
        age=state.get(field)
        if age is None: add(prefix+'_missing','critical')
        elif age>30: add(prefix+'_stale','critical')
    if state.get('oldest_active_minutes',0)>30: add('task_stalled','critical')
    if state.get('oldest_finalization_minutes',0)>5: add('finalization_stalled','critical')
    if state.get('pending_receipts',0)>0 and state.get('oldest_receipt_hours',0)>1: add('receipt_overdue')
    return alerts


def atomic_json(path, value):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    part=path.with_name(path.name+'.part')
    with part.open('w',encoding='utf-8') as stream:
        os.chmod(part,0o600); json.dump(value,stream,ensure_ascii=False); stream.flush(); os.fsync(stream.fileno())
    os.replace(part,path)


def digest(path):
    sha=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): sha.update(block)
    return sha.hexdigest()


def encrypt_file(source, destination, key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    if len(key)!=32: raise ValueError('invalid backup key')
    destination=Path(destination); part=destination.with_name(destination.name+'.part')
    header=MAGIC+os.urandom(12); worker=Cipher(algorithms.AES(key),modes.GCM(header[-12:])).encryptor()
    worker.authenticate_additional_data(header)
    try:
        with Path(source).open('rb') as src, part.open('wb') as dst:
            os.chmod(part,0o600); dst.write(header)
            for block in iter(lambda:src.read(1024*1024),b''): dst.write(worker.update(block))
            dst.write(worker.finalize()); dst.write(worker.tag); dst.flush(); os.fsync(dst.fileno())
        os.replace(part,destination)
    finally:
        if part.exists(): part.unlink()


def decrypt_file(source, destination, key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    source=Path(source); destination=Path(destination); part=destination.with_name(destination.name+'.part')
    try:
        with source.open('rb') as src:
            header=src.read(len(MAGIC)+12)
            if not header.startswith(MAGIC) or source.stat().st_size<len(header)+16: raise ValueError('invalid archive')
            src.seek(-16,2); tag=src.read(16); src.seek(len(header))
            worker=Cipher(algorithms.AES(key),modes.GCM(header[-12:],tag)).decryptor()
            worker.authenticate_additional_data(header); remaining=source.stat().st_size-len(header)-16
            with part.open('wb') as dst:
                os.chmod(part,0o600)
                while remaining:
                    block=src.read(min(remaining,1024*1024))
                    if not block: raise ValueError('truncated archive')
                    remaining-=len(block); dst.write(worker.update(block))
                dst.write(worker.finalize()); dst.flush(); os.fsync(dst.fileno())
        os.replace(part,destination)
    finally:
        if part.exists(): part.unlink()


def sqlite_snapshot(source, destination):
    started=time.monotonic()
    def progress(status,remaining,total):
        if time.monotonic()-started>120: raise TimeoutError('snapshot deadline')
    with closing(sqlite3.connect(Path(source).resolve().as_uri()+'?mode=ro',uri=True,timeout=5)) as live:
        live.execute('PRAGMA query_only=ON')
        with closing(sqlite3.connect(destination)) as snapshot:
            live.backup(snapshot,pages=256,progress=progress,sleep=.1)
            if snapshot.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise ValueError('snapshot integrity failed')


def prune_bundles(root, keep=7):
    root=Path(root).resolve()
    completed=[p for p in root.glob('production-*.aes') if BUNDLE.fullmatch(p.name)
               and p.is_file() and not p.is_symlink() and p.with_suffix('.json').is_file()]
    for path in sorted(completed,reverse=True)[keep:]:
        if path.resolve().parent!=root: raise ValueError('retention path escaped')
        path.unlink(); path.with_suffix('.json').unlink()
