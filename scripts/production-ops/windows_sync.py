"""Encrypted Windows recovery snapshots and cross-host backup mirroring."""
import datetime
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from contextlib import closing
from pathlib import Path
import win32crypt
sys.path.insert(0,str(Path(__file__).resolve().parent))
from ops_common import atomic_json,digest,encrypt_file,decrypt_file,sqlite_snapshot,prune_bundles,BUNDLE


def main(config_file):
    cfg=json.loads(Path(config_file).read_text(encoding='utf-8-sig'))
    root=Path(cfg['root']); root.mkdir(exist_ok=True)
    ssh=['-i',cfg['ssh_key'],'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12']
    def command(args,timeout=180):
        result=subprocess.run(args,capture_output=True,timeout=timeout,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode: raise RuntimeError('backup transport failed')
        return result.stdout
    def remote(action): return command(['ssh.exe',*ssh,cfg['ssh_host'],'sudo -n python3 /opt/aiwork-production/linux_ops.py '+action])
    key=win32crypt.CryptUnprotectData((root/'backup-key.dpapi').read_bytes(),None,None,None,0)[1]
    data=Path(cfg['aiwork_data'])
    with closing(sqlite3.connect((data/'bridge-billing.sqlite3').resolve().as_uri()+'?mode=ro',uri=True,timeout=5)) as db:
        count,oldest=db.execute("SELECT count(*),min(p.created_at_ms) FROM bridge_capacity_slots s LEFT JOIN bridge_prepared_budgets p ON p.budget_id=s.budget_id WHERE s.stage IN ('P','R')").fetchone()
    disk=[shutil.disk_usage(Path(drive)) for drive in ['C:/',data.anchor]]
    heartbeat={'at':int(time.time()),'pending_receipts':count,'oldest_receipt_at':oldest/1000 if oldest else None,'disk_free_percent':min(round(d.free/d.total*100,1) for d in disk)}
    atomic_json(root/'windows-health.json',heartbeat)
    command(['scp.exe','-q',*ssh,str(root/'windows-health.json'),cfg['ssh_host']+':/var/lib/aiwork-production/incoming/windows-health.json.part'])
    remote('windows-health')
    catalog=json.loads(remote('catalog'))
    mirrors=root/'linux-backups'; mirrors.mkdir(exist_ok=True)
    for entry in catalog[-7:]:
        name=entry['file']
        if not BUNDLE.fullmatch(name): raise ValueError('unsafe backup catalog')
        target=mirrors/name
        if not target.is_file() or digest(target)!=entry['sha256']:
            temporary=target.with_name(name+'.part')
            command(['scp.exe','-q',*ssh,cfg['ssh_host']+':/var/backups/aiwork-production/'+name,str(temporary)],timeout=900)
            if digest(temporary)!=entry['sha256'] or temporary.stat().st_size!=entry['bytes']: raise ValueError('mirror checksum failed')
            with tempfile.TemporaryDirectory(prefix='verify-',dir=root) as directory:
                decrypt_file(temporary,Path(directory)/'payload',key)
            os.replace(temporary,target)
        atomic_json(target.with_suffix('.json'),entry)
    if catalog: remote('mirror-ack '+catalog[-1]['file'])
    prune_bundles(mirrors,7)
    last=root/'last-windows-backup.json'
    if last.is_file() and time.time()-last.stat().st_mtime<20*3600:
        atomic_json(root/'sync-health.json',{'at':int(time.time()),'mirror_count':len(catalog),'status':'ok'}); return
    local=root/'windows-backups'; local.mkdir(exist_ok=True)
    name='production-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    with tempfile.TemporaryDirectory(prefix='capture-',dir=root) as directory:
        stage=Path(directory); (stage/'data').mkdir(); (stage/'conf').mkdir()
        sqlite_snapshot(data/'bridge-billing.sqlite3',stage/'bridge-billing.sqlite3')
        for folder in [data,data/'data']:
            for source in folder.glob('*.json'):
                contents=source.read_bytes(); json.loads(contents.decode('utf-8-sig'))
                destination=stage/source.relative_to(data); destination.write_bytes(contents)
        for filename in ['vault.stronghold','vault_key.bin']:
            source=data/'conf'/filename
            if not source.is_file(): raise ValueError('vault recovery source missing')
            shutil.copyfile(source,stage/'conf'/filename)
        # Verify original user can unlock its DPAPI key, without exporting it.
        win32crypt.CryptUnprotectData((stage/'conf/vault_key.bin').read_bytes(),None,None,None,0)
        for folder in ['profiles','profiles_trae']:
            if (data/'data'/folder).is_dir(): shutil.copytree(data/'data'/folder,stage/'data'/folder)
        with closing(sqlite3.connect(stage/'bridge-billing.sqlite3')) as db:
            count,oldest=db.execute("SELECT count(*),min(p.created_at_ms) FROM bridge_capacity_slots s JOIN bridge_prepared_budgets p ON p.budget_id=s.budget_id WHERE s.stage IN ('P','R')").fetchone()
            health={'pending_receipts':count,'oldest_receipt_hours':round((time.time()-oldest/1000)/3600,1) if oldest else 0}
        files={str(p.relative_to(stage)).replace(os.sep,'/'):digest(p) for p in stage.rglob('*') if p.is_file()}
        atomic_json(stage/'manifest.json',{'at':int(time.time()),'files':files,'health':health,'requires_original_windows_dpapi_identity':True})
        archive=stage/'payload.tar.gz'
        with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
            for item in ['bridge-billing.sqlite3','data','conf','manifest.json']:
                tar.add(stage/item,arcname=item)
            for p in stage.glob('*.json'):
                if p.name!='manifest.json': tar.add(p,arcname=p.name)
        destination=local/(name+'.aes'); encrypt_file(archive,destination,key)
        metadata={'file':destination.name,'sha256':digest(destination),'bytes':destination.stat().st_size,'at':int(time.time()),'health':health}
        atomic_json(destination.with_suffix('.json'),metadata)
        for file in [destination,destination.with_suffix('.json')]:
            command(['scp.exe','-q',*ssh,str(file),cfg['ssh_host']+':/var/lib/aiwork-production/incoming/'+file.name+'.part'],timeout=900)
        remote('windows-accept '+destination.name)
        atomic_json(last,metadata); prune_bundles(local,7)
    atomic_json(root/'sync-health.json',{'at':int(time.time()),'mirror_count':len(catalog),'status':'ok'})
    print(json.dumps({'backup_sync':'completed','pending_receipts_preserved':health['pending_receipts']}))


if __name__=='__main__':
    try: main(sys.argv[1])
    except Exception as error:
        try:
            config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
            atomic_json(Path(config['root'])/'sync-health.json',{'at':int(time.time()),'status':'failed','error_type':type(error).__name__})
        except Exception: pass
        print(json.dumps({'backup_sync':'failed','error_type':type(error).__name__})); raise SystemExit(2)
