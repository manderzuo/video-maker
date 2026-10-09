// 为 cloud 登记补 dialog sources（标题在 dialog-contracts.ts 中可验证）。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mapFile=path.join(root,'docs/review/interaction-map-cloud.json');
const map=JSON.parse(fs.readFileSync(mapFile,'utf8'));
const contracts=fs.readFileSync(path.join(root,'src/ui/dialog-contracts.ts'),'utf8');
const titles=new Map();
for(const match of contracts.matchAll(/'([^']+)'\s*:\s*'([A-Z0-9]+)'/g))titles.set(match[2],match[1]);
let fixed=0;
for(const row of map.dialogs){
 if(row.sources.length)continue;
 const title=titles.get(row.id);
 if(title&&contracts.includes(`'${title}'`)){row.sources=[{file:'src/ui/dialog-contracts.ts',anchor:`'${title}'`}];fixed++;}
}
fs.writeFileSync(mapFile,JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({dialogs:map.dialogs.length,fixed}));
