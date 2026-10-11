#!/usr/bin/env bash
set -euo pipefail
commit="$1"
archive_hash="$2"
[[ "$commit" =~ ^[0-9a-f]{40}$ && "$archive_hash" =~ ^[0-9a-f]{64}$ ]]
short="${commit:0:12}"
archive="/tmp/aiwork-mobile-preview-$short.tar.gz"
release="/opt/aiwork-studio/releases/mobile-preview-$short"
current=/opt/aiwork-studio/cloud-current
desktop="$(readlink -f "$current")"
[[ "$desktop" == /opt/aiwork-studio/releases/* && -f "$desktop/dist/index.html" ]]
config=/etc/nginx/conf.d/aiwork-studio.conf
backup="/opt/aiwork-studio/preview-configs/$short"
test ! -e "$release"
! grep -q 'BEGIN AIWORK MOBILE PREVIEW' "$config"
printf '%s  %s\n' "$archive_hash" "$archive" | sha256sum -c -
desktop_hash="$(sha256sum "$desktop/dist/index.html" | cut -d' ' -f1)"
sudo -n install -d -m 0755 "$release"
sudo -n tar -xzf "$archive" -C "$release"
sudo -n /opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node --input-type=module - "$release" "$commit" "$desktop" <<'NODE'
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [root,commit,desktop]=process.argv.slice(2),manifest=JSON.parse(readFileSync(path.join(root,'release.json'),'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(manifest.commit!==commit||manifest.seededAccounts!==0||manifest.seededContent!==0)throw Error('Preview identity mismatch');
for(const file of manifest.files){if(path.isAbsolute(file.path)||file.path.split('/').includes('..'))throw Error('Invalid inventory');const bytes=readFileSync(path.join(root,file.path));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Inventory mismatch');if(file.path.startsWith('dist/assets/')){const old=path.join(desktop,file.path);if(existsSync(old)&&sha(readFileSync(old))!==file.sha256)throw Error('Existing desktop asset would be changed');}}
if(!manifest.files.some(file=>/^dist\/assets\/MobileWorkspace-.*\.js$/.test(file.path)))throw Error('Mobile bundle missing');
console.log(JSON.stringify({previewCommit:commit,verifiedFiles:manifest.files.length,desktopAssetsPreserved:true}));
NODE
cmp "$desktop/server/package-lock.json" "$release/server/package-lock.json"
for migration in "$release"/server/migrations/*.sql; do cmp "$migration" "$desktop/server/migrations/$(basename "$migration")"; done
# New content-addressed files only; the existing desktop HTML and asset bytes stay intact.
sudo -n cp -an "$release/dist/assets/." "$desktop/dist/assets/"
sudo -n install -d -m 0700 "$backup"
sudo -n cp -a "$config" "$backup/aiwork-studio.conf"
sudo -n /opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node --input-type=module - "$config" "$release" "/tmp/nginx-mobile-preview-$short.conf" <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
const [config,root,target]=process.argv.slice(2),source=readFileSync(config,'utf8'),marker=' location = /healthz {';
if(source.split(marker).length!==2||source.includes('BEGIN AIWORK MOBILE PREVIEW'))throw Error('Unexpected Nginx configuration');
const preview=` # BEGIN AIWORK MOBILE PREVIEW\n location = /m { return 302 /m/projects; }\n location ^~ /m/ { root ${root}/dist; try_files /index.html =404; add_header Cache-Control "no-store" always; }\n # END AIWORK MOBILE PREVIEW\n`;
writeFileSync(target,source.replace(marker,preview+marker));
NODE
changed=0
rollback(){ if [[ "$changed" == 1 ]]; then sudo -n cp -a "$backup/aiwork-studio.conf" "$config"; sudo -n nginx -t; sudo -n systemctl reload nginx; fi; }
trap rollback ERR
changed=1
sudo -n install -m 0644 "/tmp/nginx-mobile-preview-$short.conf" "$config"
sudo -n nginx -t
sudo -n systemctl reload nginx
expected_index="$(sha256sum "$release/dist/index.html" | cut -d' ' -f1)"
preview_index="$(curl --fail --silent --show-error https://studio.gemstory.cn/m/projects | sha256sum | cut -d' ' -f1)"
[[ "$preview_index" == "$expected_index" ]]
[[ "$(readlink -f "$current")" == "$desktop" ]]
[[ "$(sha256sum "$desktop/dist/index.html" | cut -d' ' -f1)" == "$desktop_hash" ]]
curl --fail --silent --show-error https://studio.gemstory.cn/healthz
sudo -n systemctl is-active --quiet aiwork-studio-cloud
for asset in "$release"/dist/assets/*; do
  name="$(basename "$asset")"
  expected_asset="$(sha256sum "$asset" | cut -d' ' -f1)"
  served_asset="$(curl --fail --silent --show-error --max-time 30 "https://studio.gemstory.cn/assets/$name" | sha256sum | cut -d' ' -f1)"
  [[ "$served_asset" == "$expected_asset" ]]
done
trap - ERR
printf '\nPreview %s; desktop unchanged %s; Nginx rollback %s\n' "$commit" "$desktop" "$backup/aiwork-studio.conf"
