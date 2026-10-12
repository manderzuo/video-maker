#!/usr/bin/env bash
set -euo pipefail
candidate="$1"
[[ -f "$candidate" ]]
probe_dir="$(mktemp -d /tmp/aiwork-mobile-entry-probe-XXXXXX)"
node_bin=/opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node
"$node_bin" --input-type=module - "$candidate" "$probe_dir" <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
const [file,dir]=process.argv.slice(2);
let source=readFileSync(file,'utf8');
const http=/^server \{\n listen 80;[\s\S]*?^\}\n/gm;
if([...source.matchAll(http)].length!==1||!source.includes(' listen 443 ssl http2;\n listen [::]:443 ssl http2;'))throw Error('Unexpected server layout');
source=source.replace(http,'').replace(' listen 443 ssl http2;\n listen [::]:443 ssl http2;',' listen 127.0.0.1:4319;').replace(/^ ssl_(?:certificate(?:_key)?|protocols) .*;\n/gm,'');
writeFileSync(dir+'/nginx.conf',`worker_processes 1;\npid ${dir}/nginx.pid;\nerror_log ${dir}/error.log warn;\nevents { worker_connections 64; }\nhttp { include /etc/nginx/mime.types;\n${source}\n}\n`);
NODE
nginx -t -p "$probe_dir/" -c "$probe_dir/nginx.conf" >"$probe_dir/syntax.log" 2>&1
nginx -p "$probe_dir/" -c "$probe_dir/nginx.conf"
trap 'nginx -p "$probe_dir/" -c "$probe_dir/nginx.conf" -s quit >/dev/null 2>&1' EXIT
desktop_ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
iphone_ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
android_ua='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'
desktop_root="$(sed -n 's/^ root \(\/opt\/aiwork-studio\/[^;]*\);$/\1/p' "$candidate")"
desktop_hash="$(sha256sum "$desktop_root/index.html" | cut -d' ' -f1)"
checks=0
request(){
  local route="$1" ua="$2"
  status="$(curl --silent --show-error --max-time 10 -H 'Host: studio.gemstory.cn' -A "$ua" -D "$probe_dir/headers" -o "$probe_dir/body" -w '%{http_code}' "http://127.0.0.1:4319$route" || true)"
  location="$(sed -n 's/^[Ll]ocation: //p' "$probe_dir/headers" | tr -d '\r' | sed -E 's#^https?://[^/]+##')"
}
redirect(){
  request "$1" "$2"
  [[ "$status" == 302 && "$location" == "$3" ]] || { printf 'Entry check failed: %s status=%s location=%s expected=%s\n' "$1" "$status" "$location" "$3"; exit 1; }
  grep -qi '^Cache-Control: no-store' "$probe_dir/headers"
  grep -qi '^Vary: User-Agent' "$probe_dir/headers"
  checks=$((checks+1))
}
desktop(){
  request "$1" "$2"
  [[ "$status" == 200 && -z "$location" && "$(sha256sum "$probe_dir/body" | cut -d' ' -f1)" == "$desktop_hash" ]] || { printf 'Desktop check failed: %s status=%s\n' "$1" "$status"; exit 1; }
  checks=$((checks+1))
}
for ua in "$iphone_ua" "$android_ua"; do
  redirect / "$ua" /m/projects
  redirect /projects "$ua" /m/projects
  redirect '/projects/11111111-1111-4111-8111-111111111111/canvas?node=test' "$ua" '/m/projects/11111111-1111-4111-8111-111111111111/canvas?node=test'
  redirect /login "$ua" /m/login
  redirect /register "$ua" /m/register
  redirect /assets "$ua" /m/assets
  redirect /tasks "$ua" /m/tasks
  redirect '/prompt-generator?draft=test' "$ua" '/m/prompt-generator?draft=test'
  redirect /settings/appearance "$ua" /m/me
  desktop '/projects?view=desktop' "$ua"
  request /m/projects "$ua"; [[ "$status" == 200 && -z "$location" ]]; checks=$((checks+1))
  request /studio-api/session "$ua"; [[ "$status" == 401 && -z "$location" ]]; checks=$((checks+1))
  request /assets/aiwork-test-missing.js "$ua"; [[ "$status" == 404 && -z "$location" ]]; checks=$((checks+1))
done
for route in / /projects /login /register /projects/11111111-1111-4111-8111-111111111111/canvas; do desktop "$route" "$desktop_ua"; done
printf '{"mobileEntryChecks":%s,"desktopIndexPreserved":true,"isolatedNginxProbe":"%s"}\n' "$checks" "$probe_dir"
