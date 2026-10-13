#!/usr/bin/env python3
"""Root-only operational collector and authenticated backups. Never submits AI work."""
import argparse
import base64
import datetime
import fcntl
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import uuid
import urllib.request
from contextlib import closing
from pathlib import Path
from ops_common import alerts_for, atomic_json, digest, encrypt_file, decrypt_file, sqlite_snapshot, prune_bundles, BUNDLE
from backup_verification import unpack_verified,verify_core_media

ROOT=Path('/var/lib/aiwork-production')
BACKUPS=Path('/var/backups/aiwork-production')
KEY=Path('/etc/aiwork-production/backup.key')
CORE=Path('/var/lib/starlink-dimension-router')
STUDIO_CONFIG=Path('/etc/aiwork-studio/cloud-runtime.json')


def run(args,timeout=60):
    result=subprocess.run(args,capture_output=True,timeout=timeout,check=False)
    if result.returncode: raise RuntimeError('operational subprocess failed')
    return result.stdout


def pg(sql,database):
    return run(['runuser','-u','postgres','--','psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-d',database,'-c',sql]).decode().strip()


def age(path):
    return max(0,(time.time()-path.stat().st_mtime)/3600) if path.is_file() else None


def monitor():
    now=time.time(); state={'at':int(now),'collection_errors':0}
    cfg=json.loads(STUDIO_CONFIG.read_text())
    for service in ['aiwork-studio-cloud','starlink-dimension-router.service']:
        state[service]=subprocess.run(['systemctl','is-active','--quiet',service]).returncode==0
    state['services_ok']=state['aiwork-studio-cloud'] and state['starlink-dimension-router.service']
    try:
        with urllib.request.urlopen('http://127.0.0.1:17864/healthz',timeout=8) as response:
            state['bridge_ok']=response.status==200
    except Exception: state['bridge_ok']=False
    disk=shutil.disk_usage('/'); state['disk_free_percent']=round(disk.free/disk.total*100,1)
    state['backup_age_hours']=age(ROOT/'last-backup.json')
    state['mirror_age_hours']=age(ROOT/'last-mirror.json')
    try:
        raw=pg("SELECT json_build_object('oldest_active_minutes',COALESCE((SELECT extract(epoch from now()-min(created_at))/60 FROM workspace_video_runs WHERE document->>'executionState' IN ('persisted','uploading','submitting','accepted','running')),0),'oldest_finalization_minutes',COALESCE((SELECT extract(epoch from now()-min(created_at))/60 FROM workspace_tasks WHERE document->>'executionState'='response_received'),0),'prompt_unknown_count',(SELECT count(*) FROM workspace_tasks WHERE document->>'executionState'='response_unknown'),'video_unknown_count',(SELECT count(*) FROM workspace_video_runs WHERE document->>'executionState'='submit_unknown'))",cfg['database']['name'])
        state.update(json.loads(raw))
        with closing(sqlite3.connect((CORE/'data/core.sqlite3').as_uri()+'?mode=ro',uri=True,timeout=5)) as db:
            db.execute('PRAGMA query_only=ON')
            count,oldest=db.execute("SELECT count(*),min(created_at_ms) FROM budget_steps WHERE financial_state IN ('held','unknown','conflict')").fetchone()
            state.update(pending_receipts=count,oldest_receipt_hours=(now-oldest/1000)/3600 if oldest else 0)
            if db.execute("SELECT count(*) FROM sqlite_master WHERE name='budget_continuation_retries'").fetchone()[0]:
                state['continuation_attention_count']=db.execute("SELECT count(*) FROM budget_continuation_retries WHERE state='attention'").fetchone()[0]
    except Exception: state['collection_errors']+=1
    windows=ROOT/'last-windows-backup.json'
    if windows.is_file():
        state['windows_backup_age_hours']=age(windows)
    heartbeat=ROOT/'windows-health.json'
    if heartbeat.is_file():
        state['windows']=json.loads(heartbeat.read_text())
        oldest=state['windows'].get('oldest_receipt_at')
        state['windows']['oldest_receipt_hours']=max(0,(now-oldest)/3600) if oldest else 0
    state['alerts']=alerts_for(state)
    if not windows.is_file() or age(windows)>30: state['alerts'].append({'code':'windows_backup_stale','severity':'critical'})
    if not heartbeat.is_file() or now-state.get('windows',{}).get('at',0)>3600: state['alerts'].append({'code':'windows_monitor_stale','severity':'critical'})
    if state.get('windows',{}).get('pending_receipts',0) and state['windows'].get('oldest_receipt_hours',0)>1:
        state['alerts'].append({'code':'bridge_receipt_overdue','severity':'warning'})
    free=state.get('windows',{}).get('disk_free_percent',100)
    if free<15: state['alerts'].append({'code':'windows_disk_low','severity':'critical' if free<8 else 'warning'})
    if state.get('prompt_unknown_count',0) or state.get('video_unknown_count',0):
        state['alerts'].append({'code':'execution_unknown','severity':'warning'})
    if state.get('continuation_attention_count',0): state['alerts'].append({'code':'continuation_attention','severity':'critical'})
    previous=json.loads((ROOT/'health.json').read_text()) if (ROOT/'health.json').is_file() else {}
    atomic_json(ROOT/'health.json',state)
    changed=previous.get('alerts')!=state['alerts']
    if changed or now-previous.get('last_logged_at',0)>3600:
        state['last_logged_at']=int(now); atomic_json(ROOT/'health.json',state)
        print(json.dumps({'kind':'production_health','changed':changed,**state},ensure_ascii=False))
    else:
        state['last_logged_at']=previous.get('last_logged_at',0); atomic_json(ROOT/'health.json',state)
    return 1 if any(a['severity']=='critical' for a in state['alerts']) else 0


def private_copy(source,destination):
    source=Path(source)
    if not source.is_file() or source.is_symlink(): raise ValueError('required backup source missing')
    destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    shutil.copyfile(source,destination); os.chmod(destination,0o600)


def restore_check(stage):
    """Restore only into a fresh, isolated PG database; no application workers start."""
    name='aiwork_restore_'+uuid.uuid4().hex
    created=False
    try:
        run(['runuser','-u','postgres','--','createdb',name]); created=True
        with (stage/'studio/database.dump').open('rb') as stream:
            result=subprocess.run(['runuser','-u','postgres','--','pg_restore','--no-owner','--no-acl','--exit-on-error','-d',name],stdin=stream,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=180)
        if result.returncode: raise RuntimeError('isolated restore failed')
        assets=json.loads(pg("SELECT COALESCE(json_agg(json_build_object('owner',user_id,'id',id,'sha256',sha256,'bytes',bytes,'thumbnail',thumbnail)),'[]') FROM workspace_assets WHERE state='complete'",name))
        for asset in assets:
            for variant,expected in [('original',asset),('thumbnail-'+asset['thumbnail']['sha256'],asset['thumbnail'])] if asset['thumbnail'] else [('original',asset)]:
                if not re.fullmatch(r'[a-f0-9-]{36}',asset['owner']) or not re.fullmatch(r'[a-f0-9-]{36}',asset['id']): raise ValueError('invalid archived identity')
                path=stage/'studio/private'/asset['owner']/asset['id']/variant
                if not path.is_file() or path.stat().st_size!=int(expected['bytes']) or digest(path)!=expected['sha256']: raise ValueError('archived asset integrity failed')
        with closing(sqlite3.connect(stage/'core/data/core.sqlite3')) as db:
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise ValueError('core snapshot invalid')
            if db.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('core foreign key integrity failed')
            count=db.execute('SELECT count(*) FROM budget_steps').fetchone()[0]
        roots=json.loads((stage/'studio/keyring.json').read_text())
        if not roots.get('keys') or roots.get('activeVersion') not in roots['keys']: raise ValueError('keyring incomplete')
        keys=json.loads((stage/'core/key-environment.json').read_text())
        if len(base64.b64decode(keys['STARLINK_ROUTER_KEY_ENCRYPTION_KEY'],validate=True))!=32: raise ValueError('core key missing')
        snapshot=(json.loads((stage/'core/snapshot.json').read_text()) if (stage/'core/snapshot.json').is_file()
                  else {'at_ms':json.loads((stage/'manifest.json').read_text())['at']*1000})
        media=verify_core_media(stage/'core',keys,snapshot['at_ms'])
        return {'studio_assets_verified':len(assets),'core_steps_preserved':count,'core_media_verified':media,'isolated_restore':'passed'}
    finally:
        if created and re.fullmatch(r'aiwork_restore_[a-f0-9]{32}',name):
            run(['runuser','-u','postgres','--','dropdb',name])


def backup():
    cfg=json.loads(STUDIO_CONFIG.read_text()); now=datetime.datetime.now(datetime.timezone.utc)
    name='production-'+now.strftime('%Y%m%dT%H%M%SZ')
    BACKUPS.mkdir(parents=True,exist_ok=True,mode=0o750)
    key=KEY.read_bytes()
    if len(key)!=32: raise ValueError('backup key invalid')
    with tempfile.TemporaryDirectory(prefix='capture-',dir=ROOT) as directory:
        stage=Path(directory); os.chmod(stage,0o700); (stage/'studio').mkdir(); (stage/'core/data').mkdir(parents=True)
        with (stage/'studio/database.dump').open('wb') as output:
            result=subprocess.run(['runuser','-u','postgres','--','pg_dump','-Fc','--no-owner','--no-acl',cfg['database']['name']],stdout=output,stderr=subprocess.PIPE,timeout=180)
        if result.returncode: raise RuntimeError('database backup failed')
        shutil.copytree(cfg['assets']['root'],stage/'studio/private',symlinks=True)
        private_copy(STUDIO_CONFIG,stage/'studio/runtime.json'); private_copy(cfg['secretsFile'],stage/'studio/keyring.json')
        private_copy('/opt/aiwork-studio/cloud-current/release.json',stage/'studio/release.json')
        sqlite_snapshot(CORE/'data/core.sqlite3',stage/'core/data/core.sqlite3')
        atomic_json(stage/'core/snapshot.json',{'at_ms':int(time.time()*1000)})
        for folder in ['work-media','assets']:
            if (CORE/'data'/folder).is_dir(): shutil.copytree(CORE/'data'/folder,stage/'core/data'/folder,symlinks=True)
        for filename in ['router.json','bridge_secret.txt','video_jobs.json']:
            if (CORE/filename).is_file(): private_copy(CORE/filename,stage/'core'/filename)
        pid=int(run(['systemctl','show','starlink-dimension-router.service','-p','MainPID','--value']).strip())
        environment=dict(item.split(b'=',1) for item in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0') if b'=' in item)
        keys={key.decode():value.decode() for key,value in environment.items() if key in [b'STARLINK_ROUTER_KEY_ENCRYPTION_KEY',b'STARLINK_ROUTER_KEY_ENCRYPTION_KEY_VERSION',b'STARLINK_ROUTER_KEY_ENCRYPTION_PREVIOUS_KEYS']}
        atomic_json(stage/'core/key-environment.json',keys)
        result=restore_check(stage)
        files={}
        for path in stage.rglob('*'):
            if path.is_symlink(): raise ValueError('symlink in backup sources')
            if path.is_file(): files[str(path.relative_to(stage)).replace(os.sep,'/')]=digest(path)
        atomic_json(stage/'manifest.json',{'at':int(time.time()),'files':files,'verification':result})
        archive=stage/'payload.tar.gz'
        with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
            for directory_name in ['studio','core','manifest.json']: tar.add(stage/directory_name,arcname=directory_name,recursive=True)
        destination=BACKUPS/(name+'.aes'); encrypt_file(archive,destination,key)
        metadata={'file':destination.name,'sha256':digest(destination),'bytes':destination.stat().st_size,'at':int(time.time()),'verification':result}
        atomic_json(destination.with_suffix('.json'),metadata)
        # Ciphertext and its non-secret checksum may be mirrored by the SSH account.
        for path in [destination,destination.with_suffix('.json')]: shutil.chown(path,group='ubuntu'); os.chmod(path,0o640)
        shutil.chown(BACKUPS,group='ubuntu'); os.chmod(BACKUPS,0o750)
        atomic_json(ROOT/'last-backup.json',metadata); prune_bundles(BACKUPS,7)
        print(json.dumps({'backup_completed':True,**metadata}))


def verify_bundle(path):
    path=Path(path)
    with tempfile.TemporaryDirectory(prefix='verify-',dir=ROOT) as directory:
        stage=Path(directory); unpack_verified(path,KEY.read_bytes(),stage)
        print(json.dumps({'archive_verified':True,**restore_check(stage)}))


def main():
    if os.geteuid()!=0: raise PermissionError('root required')
    parser=argparse.ArgumentParser(); parser.add_argument('action',choices=['monitor','backup','catalog','mirror-ack','windows-accept','windows-health','verify']); parser.add_argument('value',nargs='?'); args=parser.parse_args()
    ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
    if args.action=='catalog':
        print(json.dumps([json.loads(p.read_text()) for p in sorted(BACKUPS.glob('production-*.json')) if BUNDLE.fullmatch(p.with_suffix('.aes').name)])); return 0
    if args.action=='mirror-ack':
        if not args.value or not BUNDLE.fullmatch(args.value): raise ValueError('invalid mirror name')
        meta=json.loads((BACKUPS/args.value).with_suffix('.json').read_text()); atomic_json(ROOT/'last-mirror.json',meta); return 0
    if args.action=='windows-accept':
        if not args.value or not BUNDLE.fullmatch(args.value): raise ValueError('invalid Windows backup name')
        source=ROOT/'incoming'/(args.value+'.part'); metadata=source.with_name(args.value.removesuffix('.aes')+'.json.part')
        if source.is_symlink() or metadata.is_symlink() or source.stat().st_size>1024**3: raise ValueError('invalid incoming backup')
        info=json.loads(metadata.read_text())
        if info['file']!=args.value or digest(source)!=info['sha256'] or source.stat().st_size!=info['bytes']: raise ValueError('incoming checksum failed')
        target=BACKUPS/'windows'; target.mkdir(exist_ok=True,mode=0o700)
        with tempfile.TemporaryDirectory(prefix='windows-verify-',dir=ROOT) as directory:
            stage=Path(directory); private=stage/'encrypted.aes'; shutil.copyfile(source,private)
            if digest(private)!=info['sha256']: raise ValueError('incoming changed')
            unpack_verified(private,KEY.read_bytes(),stage)
            with closing(sqlite3.connect(stage/'bridge-billing.sqlite3')) as db:
                if db.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise ValueError('Windows ledger invalid')
                db.execute('SELECT count(*) FROM bridge_capacity_slots').fetchone()
            if not all((stage/'conf'/name).is_file() for name in ['vault.stronghold','vault_key.bin']): raise ValueError('Windows vault missing')
            os.replace(private,target/args.value)
        atomic_json((target/args.value).with_suffix('.json'),info)
        source.unlink(); metadata.unlink()
        for p in [target/args.value,(target/args.value).with_suffix('.json')]: os.chown(p,0,0); os.chmod(p,0o600)
        atomic_json(ROOT/'last-windows-backup.json',info); prune_bundles(target,7); return 0
    if args.action=='windows-health':
        source=ROOT/'incoming/windows-health.json.part'
        if source.is_symlink() or source.stat().st_size>16384: raise ValueError('invalid heartbeat')
        raw=json.loads(source.read_text())
        health={name:raw[name] for name in ['at','pending_receipts','oldest_receipt_at','disk_free_percent']}
        if any(not isinstance(health[name],(int,float)) for name in ['at','pending_receipts','disk_free_percent']): raise ValueError('invalid heartbeat types')
        if abs(time.time()-health['at'])>300 or not 0<=health['pending_receipts']<=1000000 or not 0<=health['disk_free_percent']<=100: raise ValueError('invalid heartbeat values')
        if health['oldest_receipt_at'] is not None and (not isinstance(health['oldest_receipt_at'],(int,float)) or not 0<health['oldest_receipt_at']<=time.time()+300): raise ValueError('invalid receipt clock')
        atomic_json(ROOT/'windows-health.json',health); source.unlink(); return 0
    if args.action=='monitor': return monitor()
    with (ROOT/'backup.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.action=='backup': backup()
        else: verify_bundle(args.value)
    return 0


if __name__=='__main__':
    try: raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'operation_failed':True,'error_type':type(error).__name__}))
        raise SystemExit(2)
