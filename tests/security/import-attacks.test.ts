import {it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {f} from '../helpers/fixtures';
import {inspectImport} from '../../src/infrastructure/packages/import-project';
import {readPackageZip} from '../../src/infrastructure/packages/package-limits';
import {probeMedia} from '../../src/features/assets/media-probe';
function packageBlob(extra:Record<string,Uint8Array>={}){return new Blob([new Uint8Array(zipSync({'manifest.json':strToU8(JSON.stringify({format:'aiwork-studio-project',schemaVersion:1,mode:'structure',createdAt:1,assets:[]})),'project.json':strToU8(JSON.stringify(f.project())),'graph.json':strToU8(JSON.stringify(f.graph())),'runs.json':strToU8('[]'),'drafts.json':strToU8('[]'),...extra})).buffer]);}
it('T45-C05 executable SVG and HTML signatures cannot enter a raster/video preview regardless of declared MIME',async()=>{
 for(const [payload,type]of [['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>','image/png'],['<!doctype html><script>alert(1)</script>','video/mp4'],['<html onload="alert(1)">attack</html>','image/jpeg']])await expect(probeMedia(new Blob([payload],{type}))).rejects.toThrow('media_invalid_signature');
});
it('T45-C05 imported script files and traversal cannot create a validated import token',async()=>{
 for(const name of ['../outside.txt','/absolute.txt','plugin.js','index.html','attack.svg']){const blob=packageBlob({[name]:strToU8('<script>alert(1)</script>')}),result=await inspectImport(blob);expect(result).toMatchObject({ok:false,errorCode:'import_unsafe'});expect(result.plan).toBeUndefined();expect(result.original).toBe(blob);}
});
it('T45-C06 forged central-directory expansion is rejected before inflation even for a tiny compressed input',async()=>{
 const bytes=new Uint8Array(await packageBlob().arrayBuffer()),view=new DataView(bytes.buffer);let forged=false;for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,600*1024*1024,true);forged=true;break;}expect(forged).toBe(true);expect(bytes.byteLength).toBeLessThan(4096);await expect(readPackageZip(new Blob([bytes]))).rejects.toThrow('import_unsafe');expect((await inspectImport(new Blob([bytes]))).plan).toBeUndefined();
});
