#!/usr/bin/env bash
set -euo pipefail
commit="$1"; desktop_hash="$2"; mobile_hash="$3"
[[ "$commit" =~ ^[0-9a-f]{40}$ && "$desktop_hash" =~ ^[0-9a-f]{64}$ && "$mobile_hash" =~ ^[0-9a-f]{64}$ ]]
short="${commit:0:12}"
desktop="/opt/aiwork-studio/releases/frontend-patch-$short"
mobile="/opt/aiwork-studio/releases/mobile-preview-$short"
config=/etc/nginx/conf.d/aiwork-studio.conf
backup="/opt/aiwork-studio/preview-configs/frontend-$short"
backend="$(readlink -f /opt/aiwork-studio/cloud-current)"
old_static="$(sudo -n sed -n 's/^ root \(\/opt\/aiwork-studio\/[^;]*\);$/\1/p' "$config")"
[[ "$backend" == /opt/aiwork-studio/releases/* && "$old_static" == /opt/aiwork-studio/*/dist && -f "$old_static/index.html" ]]
test ! -e "$desktop"; test ! -e "$mobile"; test ! -e "$backup"
printf '%s  %s\n' "$desktop_hash" "/tmp/aiwork-desktop-$short.tar.gz" | sha256sum -c -
printf '%s  %s\n' "$mobile_hash" "/tmp/aiwork-mobile-preview-$short.tar.gz" | sha256sum -c -
old_index="$(sha256sum "$old_static/index.html" | cut -d' ' -f1)"
for kind in desktop mobile; do
  if [[ "$kind" == desktop ]]; then target="$desktop"; archive="/tmp/aiwork-desktop-$short.tar.gz"; else target="$mobile"; archive="/tmp/aiwork-mobile-preview-$short.tar.gz"; fi
  sudo -n install -d -m 0755 "$target"
  sudo -n tar -xzf "$archive" -C "$target"
done
sudo -n /opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node --input-type=module - "$commit" "$backend" "$old_static" "$desktop" "$mobile" <<'NODE'
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [commit,backend,oldStatic,...roots]=process.argv.slice(2),sha=b=>createHash('sha256').update(b).digest('hex'),assets=new Map();
for(const root of roots){
  const manifest=JSON.parse(readFileSync(path.join(root,'release.json'),'utf8'));
  if(manifest.commit!==commit||manifest.seededAccounts!==0||manifest.seededContent!==0)throw Error('Release identity mismatch');
  for(const file of manifest.files){
    if(path.isAbsolute(file.path)||file.path.split('/').includes('..'))throw Error('Invalid inventory path');
    const bytes=readFileSync(path.join(root,file.path));
    if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Inventory mismatch');
    if(file.path.startsWith('server/')&&sha(readFileSync(path.join(backend,file.path)))!==file.sha256)throw Error('Frontend patch would change backend');
    if(file.path.startsWith('dist/assets/')){
      const name=file.path.slice(5),old=path.join(oldStatic,name),prior=assets.get(name);
      if(prior&&prior!==file.sha256||existsSync(old)&&sha(readFileSync(old))!==file.sha256)throw Error('Existing asset collision');
      assets.set(name,file.sha256);
    }
  }
}
console.log(JSON.stringify({commit,verifiedReleases:roots.length,backendUnchanged:true}));
NODE
# Retain every existing hashed asset for tabs opened before this deployment.
sudo -n cp -an "$old_static/assets/." "$desktop/dist/assets/"
sudo -n cp -an "$mobile/dist/assets/." "$desktop/dist/assets/"
sudo -n install -d -m 0700 "$backup"
sudo -n cp -a "$config" "$backup/aiwork-studio.conf"
printf '%s\n' "$backend" "$old_static" "$old_index" | sudo -n tee "$backup/previous-frontend.txt" >/dev/null
sudo -n /opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node --input-type=module - "$config" "$desktop" "$mobile" "/tmp/frontend-patch-$short.conf" <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
const [config,desktop,mobile,target]=process.argv.slice(2),source=readFileSync(config,'utf8'),root=/^ root \/opt\/aiwork-studio\/[^;]+;$/gm,preview=/^ # BEGIN AIWORK MOBILE PREVIEW\n[\s\S]*?^ # END AIWORK MOBILE PREVIEW\n/gm;
if([...source.matchAll(root)].length!==1||[...source.matchAll(preview)].length!==1)throw Error('Unexpected frontend configuration');
const next=source.replace(root,` root ${desktop}/dist;`).replace(preview,` # BEGIN AIWORK MOBILE PREVIEW\n location = /m { return 302 /m/projects; }\n location ^~ /m/ { root ${mobile}/dist; try_files /index.html =404; add_header Cache-Control "no-store" always; }\n # END AIWORK MOBILE PREVIEW\n`);
writeFileSync(target,next);
NODE
changed=0
rollback(){ if [[ "$changed" == 1 ]]; then sudo -n cp -a "$backup/aiwork-studio.conf" "$config"; sudo -n nginx -t; sudo -n systemctl reload nginx; fi; }
trap rollback ERR
changed=1
sudo -n install -m 0644 "/tmp/frontend-patch-$short.conf" "$config"
sudo -n nginx -t
sudo -n systemctl reload nginx
ready=0
for attempt in 1 2 3 4 5; do
  if served_desktop="$(curl --fail --silent --show-error --max-time 10 https://studio.gemstory.cn/projects | sha256sum | cut -d' ' -f1)" && served_mobile="$(curl --fail --silent --show-error --max-time 10 https://studio.gemstory.cn/m/projects | sha256sum | cut -d' ' -f1)" && [[ "$served_desktop" == "$(sha256sum "$desktop/dist/index.html" | cut -d' ' -f1)" && "$served_mobile" == "$(sha256sum "$mobile/dist/index.html" | cut -d' ' -f1)" ]]; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 && "$(readlink -f /opt/aiwork-studio/cloud-current)" == "$backend" && "$(sha256sum "$old_static/index.html" | cut -d' ' -f1)" == "$old_index" ]]
curl --fail --silent --show-error --max-time 10 https://studio.gemstory.cn/healthz
sudo -n systemctl is-active --quiet aiwork-studio-cloud
for asset in "$desktop"/dist/assets/*; do
  expected="$(sha256sum "$asset" | cut -d' ' -f1)"
  served="$(curl --fail --silent --show-error --max-time 20 "https://studio.gemstory.cn/assets/$(basename "$asset")" | sha256sum | cut -d' ' -f1)"
  [[ "$served" == "$expected" ]]
done
trap - ERR
printf '\nFrontend patch %s; backend unchanged %s; rollback configuration %s\n' "$commit" "$backend" "$backup/aiwork-studio.conf"
