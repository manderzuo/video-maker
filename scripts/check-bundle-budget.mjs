import fs from 'node:fs';
const threshold=500000,files=fs.readdirSync('dist/assets').filter(file=>file.endsWith('.js')).map(file=>({file,bytes:fs.statSync('dist/assets/'+file).size}));
if(!files.length)throw Error('actual_build_js_missing');
const oversized=files.filter(file=>file.bytes>threshold),report={thresholdBytes:threshold,files,oversized,passed:oversized.length===0};
fs.writeFileSync(process.env.STUDIO_BUNDLE_REPORT??'docs/review/logs/T46-bundle-budget.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exit(report.passed?0:1);
